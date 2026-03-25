
import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import fs from 'fs';
import path from 'path';
import { scheduleNightmare } from './src/lib/nightmare';

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("🚀 SERVER: Iniciando...");
  fs.writeFileSync(path.join(process.cwd(), 'server_started.txt'), 'yes');

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
