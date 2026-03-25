import Dexie, { type Table } from 'dexie';
import { ScryfallCard } from './scryfall';

export type MTGFormat = 'standard' | 'pioneer' | 'modern' | 'legacy' | 'vintage' | 'commander' | 'pauper' | 'none';

export interface Deck {
  id?: number;
  name: string;
  format: MTGFormat;
  commanderId?: string; // Scryfall ID
  commanderName?: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
}

export interface DeckCard {
  id?: number;
  deckId: number;
  scryfallId: string;
  name: string;
  quantity: number;
  typeLine: string;
  manaCost: string;
  cmc: number;
  colors: string[];
  colorIdentity: string[];
  rarity: string;
  imageUri: string;
  // Offline/Translation data
  translatedName?: string;
  translatedOracleText?: string;
  isSideboard: boolean;
  isCommander: boolean;
  cardData: ScryfallCard; // Full card data for offline access
}

export class ManaSearchDB extends Dexie {
  decks!: Table<Deck>;
  deckCards!: Table<DeckCard>;

  constructor() {
    super('ManaSearchDB');
    this.version(4).stores({
      decks: '++id, name, format, createdAt, updatedAt',
      deckCards: '++id, deckId, scryfallId, name, isSideboard, isCommander'
    });
  }
}

export const db = new ManaSearchDB();
