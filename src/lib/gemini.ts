import { GoogleGenAI } from "@google/genai";

// Initialize Gemini lazily to ensure environment variables are loaded
let aiInstance: GoogleGenAI | null = null;

const getAi = () => {
  if (!aiInstance) {
    // Check multiple possible locations for the API key, filtering out placeholders
    const possibleKeys = [
      (import.meta as any).env?.GEMINI_API_KEY,
      (process.env as any)?.GEMINI_API_KEY,
      (window as any).process?.env?.GEMINI_API_KEY,
      (window as any).GEMINI_API_KEY
    ];
    
    const apiKey = possibleKeys.find(key => 
      key && 
      typeof key === 'string' && 
      key.trim() !== "" && 
      key !== "MY_GEMINI_API_KEY" && 
      key !== "undefined" &&
      !key.includes("TODO")
    ) || "";
    
    if (!apiKey) {
      console.warn("⚠️ Gemini API Key is missing or invalid. Check your AI Studio Secrets.");
    }
      
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

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

// Specialized MTG Translation using Gemini
export const translateMTG = async (text: string, type: 'keyword' | 'definition' | 'oracle' = 'oracle') => {
  if (!text || text.trim() === "") return text;

  try {
    const ai = getAi();
    const prompt = type === 'keyword' 
      ? `Translate this Magic: The Gathering keyword to Portuguese (PT-BR) using the official Wizards of the Coast glossary. Return ONLY the translated keyword. Keyword: "${text}"`
      : `Translate this Magic: The Gathering ${type} to Portuguese (PT-BR) using the official Wizards of the Coast glossary and terminology. Ensure technical terms like "battlefield", "graveyard", "scry", etc., are translated correctly. Return ONLY the translated text. Text: "${text}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.1,
      }
    });

    const result = response.text?.trim();
    if (result) return result;
    
    // Fallback to Google Translate if Gemini fails
    return await translateText(text, 'pt');
  } catch (error) {
    console.error("Gemini translation error:", error);
    return await translateText(text, 'pt');
  }
};

// Simple in-memory cache to avoid redundant translations
const translationCache: Record<string, string> = {};
const rulesCache: Record<string, string[]> = {};

export const translateToPTBR = async (text: string, type: 'keyword' | 'definition' | 'oracle' = 'oracle') => {
  if (!text || text.trim() === "") return text;
  
  const cacheKey = `${type}:${text}`;
  if (translationCache[cacheKey]) return translationCache[cacheKey];
  
  const result = await translateMTG(text, type);
  translationCache[cacheKey] = result;
  return result;
};

export const translateRules = async (rules: string[]) => {
  if (!rules.length) return [];
  
  const cacheKey = rules.join("|");
  if (rulesCache[cacheKey]) return rulesCache[cacheKey];
  
  try {
    // Translate rules using Gemini for better context
    const translatedRules = await Promise.all(
      rules.map(rule => translateToPTBR(rule, 'oracle'))
    );
    
    rulesCache[cacheKey] = translatedRules;
    return translatedRules;
  } catch (error) {
    console.error("Rules translation error:", error);
    return rules;
  }
};
