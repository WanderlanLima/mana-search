import axios from 'axios';

export interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  lang: string;
  released_at: string;
  uri: string;
  scryfall_uri: string;
  layout: string;
  highres_image: boolean;
  image_status: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    png: string;
    art_crop: string;
    border_crop: string;
  };
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  set: string;
  set_name: string;
  rarity: string;
  flavor_text?: string;
  artist?: string;
  printed_name?: string;
  printed_text?: string;
  legalities: {
    standard: string;
    future: string;
    historic: string;
    timeless: string;
    gladiator: string;
    pioneer: string;
    explorer: string;
    modern: string;
    legacy: string;
    pauper: string;
    vintage: string;
    penny: string;
    commander: string;
    oathbreaker: string;
    brawl: string;
    standardbrawl: string;
    alchemy: string;
    paupercommander: string;
    duel: string;
    oldschool: string;
    premodern: string;
    predh: string;
  };
  prices: {
    usd?: string;
    usd_foil?: string;
    eur?: string;
    tix?: string;
  };
  card_faces?: Array<{
    name: string;
    mana_cost: string;
    type_line: string;
    oracle_text: string;
    colors?: string[];
    power?: string;
    toughness?: string;
    image_uris?: {
      small: string;
      normal: string;
      large: string;
      png: string;
      art_crop: string;
      border_crop: string;
    };
  }>;
}

export interface ScryfallRule {
  object: string;
  oracle_id: string;
  source: string;
  published_at: string;
  comment: string;
}

const SCRYFALL_API = 'https://api.scryfall.com';

export const scryfall = {
  search: async (query: string, page: number = 1) => {
    try {
      // Prioritize Portuguese and English, excluding other languages unless specifically requested
      // Wrap the original query in parentheses to ensure correct operator precedence
      const finalQuery = query.includes('lang:') ? query : `(${query}) (lang:pt or lang:en)`;
      
      const response = await axios.get(`${SCRYFALL_API}/cards/search`, {
        params: {
          q: finalQuery,
          page: page,
          unique: 'oracle'
        },
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { data: [], has_more: false, total_cards: 0 };
      }
      console.error('Scryfall search error:', error);
      throw new Error(error.response?.data?.details || error.message || 'Scryfall search error');
    }
  },

  getCardRules: async (id: string, isOracleId: boolean = true): Promise<ScryfallRule[]> => {
    try {
      // Using the oracle ID endpoint is much more reliable for rulings
      // especially for rebalanced (Alchemy) or special versions of cards.
      const endpoint = isOracleId ? `/cards/oracle/${id}/rulings` : `/cards/${id}/rulings`;
      const response = await axios.get(`${SCRYFALL_API}${endpoint}`);
      return response.data.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      console.error('Scryfall rules error:', error);
      return [];
    }
  },

  getLocalizedCard: async (oracleId: string, lang: string = 'pt', set?: string): Promise<ScryfallCard | null> => {
    if (!oracleId) return null;
    
    try {
      // First try to find a version in the same set
      if (set) {
        const searchResponse = await axios.get(`${SCRYFALL_API}/cards/search`, {
          params: {
            q: `oracle_id:${oracleId} set:${set} lang:${lang}`,
            unique: 'prints'
          }
        });
        if (searchResponse.data.data && searchResponse.data.data.length > 0) {
          return searchResponse.data.data[0];
        }
      }

      // Fallback to any version with that oracle ID in the target language
      const response = await axios.get(`${SCRYFALL_API}/cards/oracle/${oracleId}`, {
        params: { lang }
      });
      
      // Scryfall might return the English version if the localized one doesn't exist
      // even if we specify lang=pt. We should check the lang property.
      if (response.data.lang === lang) {
        return response.data;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  },

  getAutocomplete: async (query: string) => {
    try {
      const response = await axios.get(`${SCRYFALL_API}/cards/autocomplete`, {
        params: { q: query },
      });
      return response.data.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      return [];
    }
  },

  getCardById: async (id: string): Promise<ScryfallCard> => {
    try {
      const response = await axios.get(`${SCRYFALL_API}/cards/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Scryfall getCardById error:', error);
      throw new Error(error.response?.data?.details || error.message || 'Error fetching card by ID');
    }
  }
};
