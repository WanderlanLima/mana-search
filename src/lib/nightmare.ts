
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { translateToPTBR } from './gemini';

const KEYWORDS_FILE = path.join(process.cwd(), 'keywords.json');
const LOG_FILE = path.join(process.cwd(), 'nightmare.log');

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logMessage);
  console.log(message);
}

interface KeywordEntry {
  name: string;
  translatedName?: string;
  definition: string;
  lastUpdated: number;
}

interface KeywordsDb {
  keywords: Record<string, KeywordEntry>;
}

// Helper to find reminder text
async function fetchReminderText(keyword: string): Promise<string | null> {
  try {
    // Strategy: Use Scryfall's "has:reminder" which is very effective
    const queries = [
      `kw:"${keyword}" has:reminder`,
      `oracle:"${keyword}" has:reminder`,
      `oracle:"${keyword} ("`
    ];

    for (const query of queries) {
      try {
        // Wait a bit before each search to be very safe with rate limits
        await new Promise(r => setTimeout(r, 100));
        
        const response = await axios.get(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`);
        const data = response.data;
        
        if (data.data && data.data.length > 0) {
          // Try to find the best match in the first few cards
          for (const card of data.data.slice(0, 5)) {
            const oracleText = card.oracle_text || "";
            // Look for the keyword followed by reminder text in parentheses
            // We use a more flexible regex to handle different formatting
            const regex = new RegExp(`(?:${keyword})[^\\(]*\\(([^\\)]+)\\)`, 'i');
            const match = oracleText.match(regex);
            if (match && match[1]) return match[1];
            
            // If it's a double-faced card, check the other side
            if (card.card_faces) {
              for (const face of card.card_faces) {
                const faceMatch = (face.oracle_text || "").match(regex);
                if (faceMatch && faceMatch[1]) return faceMatch[1];
              }
            }
          }
        }
      } catch (e) {
        // Continue to next query if one fails (e.g. 404)
        continue;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

export async function runNightmare() {
  fs.writeFileSync(path.join(process.cwd(), 'nightmare_started.txt'), 'yes');
  log("🌙 NIGHTMARE: Iniciando varredura da meia-noite...");
  
  try {
    // 1. Fetch all current keywords from Scryfall catalogs
    const catalogs = [
      'https://api.scryfall.com/catalog/keyword-abilities',
      'https://api.scryfall.com/catalog/keyword-actions'
    ];
    
    log("🌙 NIGHTMARE: Buscando catálogos do Scryfall...");
    const results = await Promise.all(catalogs.map(url => axios.get(url).then(res => res.data)));
    const allKeywords: string[] = results.flatMap(res => res.data || []);
    log(`🌙 NIGHTMARE: ${allKeywords.length} keywords encontradas nos catálogos.`);
    
    // 2. Load current database
    let db: KeywordsDb = { keywords: {} };
    if (fs.existsSync(KEYWORDS_FILE)) {
      db = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf-8'));
    }
    
    let newKeywordsCount = 0;
    
    // 3. Check for new keywords and fetch definitions
    // We'll process them one by one with a significant delay to avoid 429
    for (const keyword of allKeywords) {
      const key = keyword.toLowerCase();
      if (!db.keywords[key]) {
        log(`🌙 NIGHTMARE: Nova keyword encontrada: "${keyword}". Buscando definição...`);
        
        const reminderText = await fetchReminderText(keyword);
        
        if (reminderText) {
          log(`🌙 NIGHTMARE: Definição encontrada para "${keyword}": ${reminderText.substring(0, 50)}...`);
          
          // Translate both name and definition using specialized MTG AI
          const translatedName = await translateToPTBR(keyword, 'keyword');
          const definition = await translateToPTBR(reminderText, 'definition');
          
          db.keywords[key] = {
            name: keyword,
            translatedName: translatedName,
            definition,
            lastUpdated: Date.now()
          };
          newKeywordsCount++;
          
          // Save incrementally
          fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(db, null, 2));
          log(`🌙 NIGHTMARE: "${keyword}" salva no banco de dados.`);
        } else {
          log(`🌙 NIGHTMARE: Definição NÃO encontrada para "${keyword}".`);
        }
        
        // Wait 1 second between keywords to be very respectful of Scryfall API
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    log(`🌙 NIGHTMARE: Varredura concluída. ${newKeywordsCount} novas keywords adicionadas.`);
  } catch (error) {
    log(`🌙 NIGHTMARE: Erro crítico durante a varredura: ${error}`);
  }
}

// Function to schedule the robot
export function scheduleNightmare() {
  // Run once on startup
  runNightmare();
  
  // Run every 24 hours (86,400,000 ms)
  setInterval(() => {
    runNightmare();
  }, 24 * 60 * 60 * 1000);
}
