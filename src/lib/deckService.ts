import { db, Deck, DeckCard, MTGFormat } from './db';
import { ScryfallCard, scryfall } from './scryfall';
import { translateToPTBR } from './gemini';

export class DeckService {
  async createDeck(name: string, format: MTGFormat = 'none'): Promise<number> {
    const now = Date.now();
    return await db.decks.add({
      name,
      format,
      createdAt: now,
      updatedAt: now
    });
  }

  async deleteDeck(deckId: number) {
    await db.transaction('rw', db.decks, db.deckCards, async () => {
      await db.deckCards.where('deckId').equals(deckId).delete();
      await db.decks.delete(deckId);
    });
  }

  async addCardToDeck(
    deckId: number, 
    card: ScryfallCard, 
    quantity: number = 1, 
    isSideboard: boolean = false,
    skipTranslation: boolean = false,
    skipDeckUpdate: boolean = false,
    mode: 'add' | 'set' = 'add'
  ) {
    // Check if card already exists in deck (same sideboard status)
    const existing = await db.deckCards
      .where({ deckId, scryfallId: card.id, isSideboard: isSideboard ? 1 : 0 })
      .first();

    if (existing && existing.id) {
      const newQuantity = mode === 'add' ? existing.quantity + quantity : quantity;
      await db.deckCards.update(existing.id, {
        quantity: newQuantity
      });
    } else {
      // Fetch translation if possible (to save offline)
      let translatedName = card.printed_name || card.name;
      let translatedOracleText = card.printed_text || card.oracle_text;

      if (!skipTranslation) {
        try {
          // We try to get translations now to save them for offline use
          // If it fails, we just save the original English text
          translatedName = await translateToPTBR(card.name, 'oracle');
          translatedOracleText = await translateToPTBR(card.oracle_text || '', 'oracle');
        } catch (e) {
          console.warn("DeckService: Failed to pre-translate card for deck", e);
        }
      }

      await db.deckCards.add({
        deckId,
        scryfallId: card.id,
        name: card.name,
        quantity,
        typeLine: card.type_line,
        manaCost: card.mana_cost || '',
        cmc: card.cmc || 0,
        colors: card.colors || [],
        colorIdentity: card.color_identity || [],
        rarity: card.rarity,
        imageUri: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '',
        translatedName,
        translatedOracleText,
        isSideboard,
        isCommander: false,
        cardData: card
      });
    }

    if (!skipDeckUpdate) {
      await db.decks.update(deckId, { updatedAt: Date.now() });
    }
  }

  async removeCardFromDeck(cardId: number) {
    const card = await db.deckCards.get(cardId);
    if (card) {
      await db.deckCards.delete(cardId);
      await db.decks.update(card.deckId, { updatedAt: Date.now() });
    }
  }

  async updateCardQuantity(cardId: number, quantity: number) {
    if (quantity <= 0) {
      await this.removeCardFromDeck(cardId);
    } else {
      const card = await db.deckCards.get(cardId);
      if (card) {
        await db.deckCards.update(cardId, { quantity });
        await db.decks.update(card.deckId, { updatedAt: Date.now() });
      }
    }
  }

  async toggleCommander(cardId: number) {
    const card = await db.deckCards.get(cardId);
    if (card) {
      await db.deckCards.update(cardId, { isCommander: !card.isCommander });
      await db.decks.update(card.deckId, { updatedAt: Date.now() });
    }
  }

  async validateDeck(deckId: number) {
    const deck = await db.decks.get(deckId);
    const cards = await db.deckCards.where('deckId').equals(deckId).toArray();
    
    if (!deck) return { isValid: false, errors: ['Deck não encontrado'] };

    const errors: string[] = [];
    const mainboard = cards.filter(c => !c.isSideboard);
    const sideboard = cards.filter(c => c.isSideboard);
    const commanders = cards.filter(c => c.isCommander);
    
    const mainCount = mainboard.reduce((sum, c) => sum + c.quantity, 0);
    const sideCount = sideboard.reduce((sum, c) => sum + c.quantity, 0);

    // Aggregate by name for 4-copy rule
    const nameCounts: Record<string, number> = {};
    cards.forEach(c => {
      nameCounts[c.name] = (nameCounts[c.name] || 0) + c.quantity;
    });

    // Basic MTG Rules
    if (deck.format !== 'commander' && deck.format !== 'none') {
      if (mainCount < 60) errors.push(`O deck principal deve ter pelo menos 60 cartas (atual: ${mainCount})`);
      if (sideCount > 15) errors.push(`O sideboard deve ter no máximo 15 cartas (atual: ${sideCount})`);
      
      // 4-copy rule (excluding basic lands)
      const basicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
      Object.entries(nameCounts).forEach(([name, count]) => {
        if (!basicLands.includes(name) && count > 4) {
          errors.push(`Você tem mais de 4 cópias de "${name}"`);
        }
      });
    }

    if (deck.format === 'commander') {
      if (mainCount !== 100) errors.push(`Decks de Commander devem ter exatamente 100 cartas (atual: ${mainCount})`);
      if (commanders.length === 0) errors.push(`O deck de Commander deve ter pelo menos um Comandante definido.`);
      if (commanders.length > 2) errors.push(`O deck de Commander pode ter no máximo 2 Comandantes (Parceiros).`);
      
      // Singleton rule
      const basicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
      Object.entries(nameCounts).forEach(([name, count]) => {
        if (!basicLands.includes(name) && count > 1) {
          errors.push(`Commander é um formato Singleton. Você tem ${count} cópias de "${name}"`);
        }
      });

      // Color Identity
      if (commanders.length > 0) {
        const commanderIdentity = new Set<string>();
        commanders.forEach(c => {
          c.colorIdentity.forEach(color => commanderIdentity.add(color));
        });

        cards.forEach(c => {
          c.colorIdentity.forEach(color => {
            if (!commanderIdentity.has(color)) {
              errors.push(`"${c.name}" tem a cor ${color}, que não está na identidade de cor do seu Comandante.`);
            }
          });
        });
      }
    }

    if (deck.format === 'pauper') {
      cards.forEach(c => {
        if (c.rarity !== 'common') {
          errors.push(`"${c.name}" não é comum e não é permitida no Pauper.`);
        }
      });
    }

    // Scryfall Legalities Check
    if (deck.format !== 'none') {
      cards.forEach(c => {
        const legality = (c.cardData.legalities as any)[deck.format];
        if (legality === 'not_legal' || legality === 'banned') {
          errors.push(`"${c.name}" é banida ou não permitida no formato ${deck.format}.`);
        }
        if (legality === 'restricted' && nameCounts[c.name] > 1) {
          errors.push(`"${c.name}" é restrita no formato ${deck.format} (máximo 1 cópia).`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors: Array.from(new Set(errors)), // Deduplicate
      counts: { main: mainCount, side: sideCount }
    };
  }

  async getDeckStats(deckId: number) {
    const cards = await db.deckCards.where('deckId').equals(deckId).toArray();
    
    const manaCurve: Record<number, number> = {};
    const colors: Record<string, number> = {};
    const types: Record<string, number> = {};

    let totalCmc = 0;
    let totalNonLandCards = 0;

    cards.forEach(c => {
      // Mana Curve
      const cmc = Math.floor(c.cmc);
      manaCurve[cmc] = (manaCurve[cmc] || 0) + c.quantity;

      // Average CMC (excluding lands)
      if (!c.typeLine.includes('Land')) {
        totalCmc += c.cmc * c.quantity;
        totalNonLandCards += c.quantity;
      }

      // Colors
      c.colors.forEach(color => {
        colors[color] = (colors[color] || 0) + c.quantity;
      });

      // Types
      if (c.typeLine.includes('Creature')) types['Creature'] = (types['Creature'] || 0) + c.quantity;
      if (c.typeLine.includes('Instant')) types['Instant'] = (types['Instant'] || 0) + c.quantity;
      if (c.typeLine.includes('Sorcery')) types['Sorcery'] = (types['Sorcery'] || 0) + c.quantity;
      if (c.typeLine.includes('Artifact')) types['Artifact'] = (types['Artifact'] || 0) + c.quantity;
      if (c.typeLine.includes('Enchantment')) types['Enchantment'] = (types['Enchantment'] || 0) + c.quantity;
      if (c.typeLine.includes('Land')) types['Land'] = (types['Land'] || 0) + c.quantity;
      if (c.typeLine.includes('Planeswalker')) types['Planeswalker'] = (types['Planeswalker'] || 0) + c.quantity;
      if (c.typeLine.includes('Battle')) types['Battle'] = (types['Battle'] || 0) + c.quantity;
      if (c.typeLine.includes('Kindred') || c.typeLine.includes('Tribal')) types['Kindred'] = (types['Kindred'] || 0) + c.quantity;
    });

    const avgCmc = totalNonLandCards > 0 ? (totalCmc / totalNonLandCards).toFixed(2) : '0.00';

    return { manaCurve, colors, types, avgCmc };
  }

  async exportDeckList(deckId: number): Promise<string> {
    const cards = await db.deckCards.where('deckId').equals(deckId).toArray();
    const mainboard = cards.filter(c => !c.isSideboard);
    const sideboard = cards.filter(c => c.isSideboard);

    let list = '';
    mainboard.forEach(c => {
      list += `${c.quantity} ${c.name}\n`;
    });

    if (sideboard.length > 0) {
      list += '\nSideboard\n';
      sideboard.forEach(c => {
        list += `${c.quantity} ${c.name}\n`;
      });
    }

    return list;
  }

  async importDeckList(deckId: number, text: string): Promise<{ added: string[], notFound: string[] }> {
    const lines = text.split('\n');
    const added: string[] = [];
    const notFound: string[] = [];
    let isSideboard = false;

    const parsedCards: Array<{ name: string, quantity: number, isSideboard: boolean }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.toLowerCase() === 'sideboard') {
        isSideboard = true;
        continue;
      }

      const match = trimmed.match(/^(\d+)\s+(.+)$/) || [null, "1", trimmed];
      const quantity = parseInt(match[1] as string, 10) || 1;
      const cardName = (match[2] as string).trim();
      
      parsedCards.push({ name: cardName, quantity, isSideboard });
    }

    if (parsedCards.length === 0) return { added, notFound };

    // Batch fetch from Scryfall (max 75 per request)
    const BATCH_SIZE = 75;
    for (let i = 0; i < parsedCards.length; i += BATCH_SIZE) {
      const batch = parsedCards.slice(i, i + BATCH_SIZE);
      const names = batch.map(p => p.name);
      
      try {
        const scryfallCards = await scryfall.getCardsByNames(names);
        
        // Map scryfall results back to our parsed cards
        for (const parsed of batch) {
          const found = scryfallCards.find(sc => {
            const scName = sc.name.toLowerCase();
            const parsedName = parsed.name.toLowerCase();
            
            return scName === parsedName || 
                   scName.startsWith(parsedName + " //") ||
                   (sc.printed_name && sc.printed_name.toLowerCase() === parsedName);
          });

          if (found) {
            // We use addCardToDeck with skipTranslation and skipDeckUpdate for speed
            // We use mode 'set' to avoid duplicating cards if re-importing the same list
            await this.addCardToDeck(deckId, found, parsed.quantity, parsed.isSideboard, true, true, 'set');
            added.push(`${parsed.quantity}x ${found.name}`);
          } else {
            notFound.push(parsed.name);
          }
        }
      } catch (error) {
        console.error('Batch import error:', error);
        batch.forEach(p => notFound.push(p.name));
      }
    }

    // Update deck once at the end
    await db.decks.update(deckId, { updatedAt: Date.now() });

    return { added, notFound };
  }
}

export const deckService = new DeckService();
