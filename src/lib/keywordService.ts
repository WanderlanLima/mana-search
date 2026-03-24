
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
        // 🌙 Fetch keywords from our static JSON file
        // Using a more robust path for GitHub Pages compatibility
        const basePath = import.meta.env.BASE_URL || './';
        const url = `${basePath.endsWith('/') ? basePath : basePath + '/'}keywords.json`.replace(/\/+/g, '/');
        
        console.log(`KeywordService: Fetching keywords from ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch keywords: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data && data.keywords) {
          this.definitions = data.keywords;
          this.updateKeywordList();
          this.saveToStorage(); // Save the fresh data to localStorage
          console.log(`KeywordService: Successfully loaded ${this.keywords.length} keyword variations.`);
        }
        
        this.isInitialized = true;
      } catch (error) {
        console.error("KeywordService: Error initializing keywords", error);
        // If fetch fails, we still have the data from loadFromStorage() if it was there
      }
    })();

    return this.initPromise;
  }

  getKeywords() {
    return this.keywords;
  }

  getKeywordCount() {
    return this.keywords.length;
  }

  getAllDefinitions() {
    return this.definitions;
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
    
    for (const keyword of this.keywords) {
      // Escape keyword for regex and use word boundaries
      const escapedKw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedKw}\\b`, 'gi');
      
      if (regex.test(text)) {
        found.push(keyword);
      }
    }
    
    return found;
  }
}

export const keywordService = new KeywordService();
