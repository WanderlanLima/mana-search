
import { translateToPTBR } from './gemini';

const SCRYFALL_CATALOGS = [
  'https://api.scryfall.com/catalog/keyword-abilities',
  'https://api.scryfall.com/catalog/keyword-actions'
];

export interface KeywordDefinition {
  name: string;
  translatedName?: string;
  definition: string;
  lastUpdated: number;
}

class KeywordService {
  private keywords: string[] = [];
  private definitions: Record<string, KeywordDefinition> = {};
  private nameToKey: Record<string, string> = {};
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const stored = localStorage.getItem('mtg_keyword_definitions');
    if (stored) {
      this.definitions = JSON.parse(stored);
      this.updateKeywordList();
    }
  }

  private updateKeywordList() {
    const allNames: string[] = [];
    const mapping: Record<string, string> = {};

    Object.entries(this.definitions).forEach(([key, def]) => {
      // Add English name
      allNames.push(def.name);
      mapping[def.name.toLowerCase()] = key;

      // Add Portuguese name if available
      if (def.translatedName) {
        allNames.push(def.translatedName);
        mapping[def.translatedName.toLowerCase()] = key;
      }
    });

    // Sort by length (descending) to match longer phrases first (e.g., "Vínculo com a vida" before "vida")
    this.keywords = [...new Set(allNames)].sort((a, b) => b.length - a.length);
    this.nameToKey = mapping;
  }

  private saveToStorage() {
    localStorage.setItem('mtg_keyword_definitions', JSON.stringify(this.definitions));
  }

  async initialize() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // 🌙 Fetch keywords from our NIGHTMARE API
        const response = await fetch('/api/keywords');
        const data = await response.json();
        
        if (data && data.keywords) {
          this.definitions = data.keywords;
          this.updateKeywordList();
          console.log(`KeywordService: Loaded ${this.keywords.length} keyword variations. Sample: ${this.keywords.slice(0, 5).join(', ')}`);
        }
        
        this.isInitialized = true;
        console.log(`KeywordService: Loaded ${this.keywords.length} keyword variations from Nightmare DB.`);
      } catch (error) {
        console.error("KeywordService: Error fetching keywords from Nightmare API", error);
      }
    })();

    return this.initPromise;
  }

  getKeywords() {
    // console.log(`KeywordService: Returning ${this.keywords.length} keywords.`);
    return this.keywords;
  }

  isKeyword(text: string): boolean {
    return !!this.nameToKey[text.toLowerCase()];
  }

  async getDefinition(keyword: string): Promise<string> {
    const key = this.nameToKey[keyword.toLowerCase()];
    
    if (key && this.definitions[key]) {
      return this.definitions[key].definition;
    }

    return `O robô NIGHTMARE ainda não catalogou a definição oficial para "${keyword}". Ele fará uma varredura automática para tentar encontrar o texto nos lembretes das cartas.`;
  }

  // Helper to find keywords in a text block
  findKeywordsInText(text: string): string[] {
    if (!text) return [];
    const found: string[] = [];
    const lowerText = text.toLowerCase();
    
    for (const keyword of this.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      // Use word boundaries to avoid partial matches (e.g., "Flying" in "Flyings")
      const regex = new RegExp(`\\b${lowerKeyword}\\b`, 'g');
      if (regex.test(lowerText)) {
        found.push(keyword);
      }
    }
    
    return found;
  }
}

export const keywordService = new KeywordService();
