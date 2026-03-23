import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Simple in-memory cache to avoid redundant translations
const translationCache: Record<string, string> = {};
const rulesCache: Record<string, string[]> = {};

export const translateToPTBR = async (text: string, context: string = "Magic: The Gathering card text or rules") => {
  if (!text || text.trim() === "") return text;
  
  const cacheKey = `${context}:${text}`;
  if (translationCache[cacheKey]) return translationCache[cacheKey];
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Traduza para PT-BR (Magic: The Gathering). Retorne APENAS a tradução.\n\nTexto: ${text}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
      }
    });
    
    const result = response.text || text;
    translationCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.error("Translation error:", error);
    return text;
  }
};

export const translateRules = async (rules: string[]) => {
  if (!rules.length) return [];
  
  const cacheKey = rules.join("|");
  if (rulesCache[cacheKey]) return rulesCache[cacheKey];
  
  try {
    const combinedRules = rules.join("\n---\n");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Traduza as regras de MTG para PT-BR. Use "---" como separador. Retorne APENAS as traduções.\n\nRegras:\n${combinedRules}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
      }
    });
    
    const translatedText = response.text || combinedRules;
    const result = translatedText.split("\n---\n").map(r => r.trim());
    rulesCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.error("Rules translation error:", error);
    return rules;
  }
};
