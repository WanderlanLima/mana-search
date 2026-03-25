import { db } from './db';

const translateText = async (text: string, target: string = 'pt') => {
  if (!text || text.trim() === "") return text;
  
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data && data[0]) {
      return data[0].map((part: any) => part[0]).join('');
    }
    return text;
  } catch (error) {
    console.error("Translation error:", error);
    return text;
  }
};

export const translateMTG = async (text: string, type: 'keyword' | 'definition' | 'oracle' = 'oracle') => {
  if (!text || text.trim() === "") return text;

  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, type })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Server error');
    }
    
    const result = await response.json();
    return result.translatedText || text;
  } catch (error: any) {
    console.error("❌ Gemini API translation error:", error);
    console.log("🌐 Translation: Falling back to Google Translate due to error.");
    return await translateText(text, 'pt');
  }
};

export const identifyCardFromImage = async (base64Image: string): Promise<string | null> => {
  try {
    const response = await fetch('/api/identifyCard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Image.split(',')[1] || base64Image })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Server error');
    }

    const result = await response.json();
    const name = result.name;
    if (name && name.toLowerCase() !== 'unknown') {
      return name;
    }
    return null;
  } catch (error: any) {
    console.error("Gemini Vision API error:", error);
    const errorMsg = error?.message?.toLowerCase() || "";
    if (errorMsg.includes("quota") || errorMsg.includes("429") || errorMsg.includes("limit")) {
      throw new Error("GEMINI_QUOTA_EXCEEDED");
    }
    if (errorMsg.includes("key") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("gemini_not_configured")) {
      throw new Error("GEMINI_AUTH_ERROR");
    }
    return null;
  }
};

export const translateToPTBR = async (text: string, type: 'keyword' | 'definition' | 'oracle' = 'oracle') => {
  if (!text || text.trim() === "") return text;
  
  // Create a predictable ID hash for the text+type
  const cacheKey = `${type}:${text.substring(0, 100)}`; // limit size of key
  
  try {
    const cached = await db.translations.get(cacheKey);
    if (cached) {
      return cached.translatedText;
    }
  } catch (e) {
    // Dexie issue, ignore and proceed
  }
  
  const result = await translateMTG(text, type);
  
  if (result !== text) {
    try {
      await db.translations.put({
        id: cacheKey,
        originalText: text,
        translatedText: result,
        type: type,
        createdAt: Date.now()
      });
    } catch (e) {
      console.warn("Failed to cache translation in Dexie", e);
    }
  }
  
  return result;
};

export const translateRules = async (rules: string[]) => {
  if (!rules.length) return [];
  
  try {
    const translatedRules = await Promise.all(
      rules.map(rule => translateToPTBR(rule, 'oracle'))
    );
    return translatedRules;
  } catch (error: any) {
    console.error("Rules translation error:", error);
    return rules;
  }
};
