import { db, Deck, DeckCard, MTGFormat } from './db';
import { ScryfallCard } from './scryfall';
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
    isSideboard: boolean = false
  ) {
    // Check if card already exists in deck (same sideboard status)
    const existing = await db.deckCards
      .where({ deckId, scryfallId: card.id, isSideboard: isSideboard ? 1 : 0 })
      .first();

    if (existing && existing.id) {
      await db.deckCards.update(existing.id, {
        quantity: existing.quantity + quantity
      });
    } else {
      // Fetch translation if possible (to save offline)
      let translatedName = card.printed_name || card.name;
      let translatedOracleText = card.printed_text || card.oracle_text;

      try {
        // We try to get translations now to save them for offline use
        // If it fails, we just save the original English text
        translatedName = await translateToPTBR(card.name, 'oracle');
        translatedOracleText = await translateToPTBR(card.oracle_text || '', 'oracle');
      } catch (e) {
        console.warn("DeckService: Failed to pre-translate card for deck", e);
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

    await db.decks.update(deckId, { updatedAt: Date.now() });
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
}

export const deckService = new DeckService();
