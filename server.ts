
import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from "@google/genai";
import { scheduleNightmare } from './src/lib/nightmare';

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("🚀 SERVER: Iniciando...");
  fs.writeFileSync(path.join(process.cwd(), 'server_started.txt'), 'yes');

  app.use(express.json({ limit: '10mb' }));

  // 🌙 Iniciar o robô NIGHTMARE
  scheduleNightmare();

  // API para as keywords
  app.get("/api/keywords", (req, res) => {
    const KEYWORDS_FILE = path.join(process.cwd(), 'public', 'keywords.json');
    if (fs.existsSync(KEYWORDS_FILE)) {
      const db = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf-8'));
      res.json(db);
    } else {
      res.status(404).json({ error: "Keywords database not found" });
    }
  });

  // Gemini API Endpoints
  const getAi = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  };

  app.post('/api/translate', async (req, res) => {
    const { text, type } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const ai = getAi();
    if (!ai) return res.status(503).json({ error: 'GEMINI_NOT_CONFIGURED' });

    try {
      const prompt = type === 'keyword' 
        ? `Translate this Magic: The Gathering keyword to Portuguese (PT-BR) using the official Wizards of the Coast glossary. Return ONLY the translated keyword. Keyword: "${text}"`
        : type === 'definition'
          ? `Provide a concise definition in Portuguese (PT-BR) for the Magic: The Gathering keyword "${text}" using the official Wizards of the Coast glossary. Return ONLY the definition.`
          : `Translate this Magic: The Gathering ${type} to Portuguese (PT-BR) using the official Wizards of the Coast glossary and terminology. Ensure technical terms like "battlefield", "graveyard", "scry", etc., are translated correctly. Return ONLY the translated text. Text: "${text}"`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { temperature: 0.1 }
      });
      res.json({ translatedText: response.text?.trim() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/identifyCard', async (req, res) => {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Image is required' });
    
    const ai = getAi();
    if (!ai) return res.status(503).json({ error: 'GEMINI_NOT_CONFIGURED' });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: "Identify the name of this Magic: The Gathering card. Return ONLY the card name in English. If you cannot identify it, return 'unknown'." }
        ],
        config: { temperature: 0.1 }
      });
      res.json({ name: response.text?.trim() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌙 NIGHTMARE SERVER: Rodando em http://localhost:${PORT}`);
  });
}

startServer();
