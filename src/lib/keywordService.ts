
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
    if (typeof localStorage === 'undefined') return;
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
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('mtg_keyword_definitions', JSON.stringify(this.definitions));
  }

  async initialize() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // 🌙 Fetch keywords silently from the OFFICIAL CLOUD REPOSITORY first
        // Fails back to local bundling or cached version if offline
        const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/WanderlanLima/mana-search/main/public/keywords.json';
        
        console.log(`KeywordService: Fast-Syncing from Official GitHub Cloud Data...`);
        let response;
        try {
          response = await fetch(GITHUB_RAW_URL, { cache: "no-cache" });
        } catch (e) {
          // You're probably offline, fall back to local bundled version
          const basePath = import.meta.env.BASE_URL || './';
          const localUrl = `${basePath.endsWith('/') ? basePath : basePath + '/'}keywords.json`.replace(/\/+/g, '/');
          response = await fetch(localUrl);
        }
        
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
    return Object.keys(this.definitions).length;
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

    // 🌟 If not found in local database, try to get a definition using Gemini
    try {
      console.log(`KeywordService: Definition for "${keyword}" not found locally. Requesting from Gemini...`);
      const aiDefinition = await translateToPTBR(keyword, 'definition');
      
      if (aiDefinition && aiDefinition !== keyword) {
        // Optionally save this to the local definitions for this session
        const newKey = keyword.toLowerCase();
        this.definitions[newKey] = {
          name: keyword,
          definition: aiDefinition,
          lastUpdated: Date.now()
        };
        this.updateKeywordList();
        return aiDefinition;
      }
    } catch (error) {
      console.error("KeywordService: Error getting definition from Gemini", error);
    }

    return `O robô NIGHTMARE ainda não catalogou a definição oficial para "${keyword}". Ele fará uma varredura automática para tentar encontrar o texto nos lembretes das cartas.`;
  }

  getKeywordKey(text: string): string | undefined {
    return this.nameToKey[text.toLowerCase()];
  }

  // Helper to find keywords in a text block
  findKeywordsInText(text: string): string[] {
    if (!text) return [];
    
    const matches: { keyword: string, start: number, end: number }[] = [];
    
    // 1. Find all possible matches for all keywords
    for (const keyword of this.keywords) {
      // Escape keyword for regex and replace spaces with \s+ for flexibility
      const escapedKw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const regex = new RegExp(`\\b${escapedKw}\\b`, 'gi');
      
      let match;
      // Reset regex index for safety (though it's a new instance)
      regex.lastIndex = 0;
      
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          keyword,
          start: match.index,
          end: match.index + match[0].length
        });
        
        // Prevent infinite loop if match is empty
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }
    
    // 2. Sort matches by length (descending) to prioritize longer phrases
    // Then by start position to maintain order
    matches.sort((a, b) => {
      const lenA = a.end - a.start;
      const lenB = b.end - b.start;
      if (lenB !== lenA) return lenB - lenA;
      return a.start - b.start;
    });
    
    // 3. Filter out matches that are contained within or overlap with longer matches
    const finalKeywords: string[] = [];
    const coveredPositions = new Set<number>();
    
    for (const match of matches) {
      let isOverlapping = false;
      for (let i = match.start; i < match.end; i++) {
        if (coveredPositions.has(i)) {
          isOverlapping = true;
          break;
        }
      }
      
      if (!isOverlapping) {
        finalKeywords.push(match.keyword);
        // Mark these positions as covered
        for (let i = match.start; i < match.end; i++) {
          coveredPositions.add(i);
        }
      }
    }
    
    // 4. Return keywords in the order they appear in the text
    // We can re-sort them by their original start position
    return finalKeywords.sort((a, b) => {
      const startA = matches.find(m => m.keyword === a)?.start || 0;
      const startB = matches.find(m => m.keyword === b)?.start || 0;
      return startA - startB;
    });
  }
}

export const keywordService = new KeywordService();
