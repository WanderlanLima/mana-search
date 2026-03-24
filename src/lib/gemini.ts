// Free Google Translate API implementation (no key required)
const translateText = async (text: string, target: string = 'pt') => {
  if (!text || text.trim() === "") return text;
  
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    // Google Translate returns an array of arrays for parts of the text
    if (data && data[0]) {
      return data[0].map((part: any) => part[0]).join('');
    }
    return text;
  } catch (error) {
    console.error("Translation error:", error);
    return text;
  }
};

// Simple in-memory cache to avoid redundant translations
const translationCache: Record<string, string> = {};
const rulesCache: Record<string, string[]> = {};

export const translateToPTBR = async (text: string, _context: string = "") => {
  if (!text || text.trim() === "") return text;
  
  if (translationCache[text]) return translationCache[text];
  
  const result = await translateText(text, 'pt');
  translationCache[text] = result;
  return result;
};

export const translateRules = async (rules: string[]) => {
  if (!rules.length) return [];
  
  const cacheKey = rules.join("|");
  if (rulesCache[cacheKey]) return rulesCache[cacheKey];
  
  try {
    // Translate each rule individually to avoid URL length limits
    const translatedRules = await Promise.all(
      rules.map(rule => translateText(rule, 'pt'))
    );
    
    rulesCache[cacheKey] = translatedRules;
    return translatedRules;
  } catch (error) {
    console.error("Rules translation error:", error);
    return rules;
  }
};
