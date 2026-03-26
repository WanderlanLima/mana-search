import { db } from './db';
import { storage } from './storage';

const callGeminiDirectly = async (prompt: string, imageBase64?: string) => {
  const apiKey = storage.getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_AUTH_ERROR");

  const partText = { text: prompt };
  const parts = imageBase64 
    ? [partText, { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }] 
    : [partText];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2 }
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Gemini API Error');
  }

  const data = await response.json();
  if (data.candidates && data.candidates.length > 0) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error("No content generated");
};

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
    const prompt = type === 'keyword' 
      ? `Translate this Magic: The Gathering keyword to Portuguese (PT-BR) using the official Wizards of the Coast glossary. Return ONLY the translated keyword. Keyword: "${text}"`
      : type === 'definition'
        ? `Provide a concise definition in Portuguese (PT-BR) for the Magic: The Gathering keyword "${text}" using the official Wizards of the Coast glossary. Return ONLY the definition.`
        : `Translate this Magic: The Gathering ${type} to Portuguese (PT-BR) using the official Wizards of the Coast glossary and terminology. Ensure technical terms like "battlefield", "graveyard", "scry", etc., are translated correctly. Return ONLY the translated text. Text: "${text}"`;
    
    const result = await callGeminiDirectly(prompt);
    return result.trim() || text;
  } catch (error: any) {
    console.error("❌ Gemini API translation error:", error);
    console.log("🌐 Translation: Falling back to Google Translate due to error.");
    return await translateText(text, 'pt');
  }
};

export const identifyCardFromImage = async (base64Image: string): Promise<string | null> => {
  try {
    const prompt = "Identify the exact English name of this Magic: The Gathering card. Return ONLY the absolute exact card name. If you cannot identify it, return 'unknown'.";
    const result = await callGeminiDirectly(prompt, base64Image.split(',')[1] || base64Image);
    const name = result.trim();
    
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
    if (errorMsg.includes("key") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("gemini_auth_error")) {
      throw new Error("GEMINI_AUTH_ERROR");
    }
    return null;
  }
};

export const analyzeDeckStrategy = async (decklist: string, commander?: string): Promise<string | null> => {
  try {
    const prompt = `Como um expert e jogador profissional de Magic: The Gathering, analise a seguinte lista de deck. 
${commander ? `O Comandante do deck é: ${commander}.` : ''}

Forneça um resumo estratégico profundo, mas direto e muito bem formatado em Markdown. Divida em três seções:
1. **Estratégia Principal**: Qual é o plano de jogo e arquétipo geral?
2. **Sinergias e Combos**: Destaque as interações entre peças chave da lista.
3. **Condições de Vitória (Wincons)**: Como o deck finaliza o jogo?

Retorne sua análise inteiramente em Português do Brasil (PT-BR).

Lista do Deck:
${decklist}`;

    const strategy = await callGeminiDirectly(prompt);
    return strategy.trim();
  } catch (error: any) {
    console.error("Gemini Analyze Deck API error:", error);
    return "Não foi possível gerar a estratégia de deck. Por favor, verifique se sua CHAVE DE API (Gemini Key) nas Configurações é válida e compatível com o Gemini 2.5 Flash.";
  }
};

export const translateToPTBR = async (text: string, type: 'keyword' | 'definition' | 'oracle' = 'oracle') => {
  if (!text || text.trim() === "") return text;
  
  const cacheKey = `${type}:${text.substring(0, 100)}`;
  
  try {
    const cached = await db.translations.get(cacheKey);
    if (cached) {
      return cached.translatedText;
    }
  } catch (e) {}
  
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
    } catch (e) {}
  }
  
  return result;
};

export const translateRules = async (rules: string[]) => {
  if (!rules.length) return [];
  try {
    return await Promise.all(rules.map(rule => translateToPTBR(rule, 'oracle')));
  } catch (error: any) {
    return rules;
  }
};
