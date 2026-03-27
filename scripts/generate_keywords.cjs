const fs = require('fs');
const https = require('https');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const KEYWORDS_FILE = path.join(__dirname, '../public/keywords.json');

// --- Helpers ---
const fetchJson = (url) => new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ManaSearch/1.0' } }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
});

async function translateWithGemini(keywordName) {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set in environment.");
    
    const prompt = `Traduza para português do Brasil e explique a mecânica/palavra-chave do Magic: The Gathering chamada "${keywordName}". 
A resposta deve ser ESTRITAMENTE um arquivo JSON válido com a estrutura:
{
  "translatedName": "Nome em Português",
  "definition": "Regra detalhada em português."
}`;

    const postData = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
    });

    const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    const content = result.candidates[0].content.parts[0].text;
                    resolve(JSON.parse(content));
                } catch (e) {
                    console.error("Failed parsing Gemini response for", keywordName, data);
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// --- Main Engine ---
async function runAutoTranslator() {
    console.log("-> Initializing Auto-Translator for MTG Keywords...");
    
    // 1. Carrega o banco atual
    let existingData = { keywords: {} };
    if (fs.existsSync(KEYWORDS_FILE)) {
        existingData = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf8'));
        console.log(`-> Found existing database with ${Object.keys(existingData.keywords).length} translated keywords.`);
    }

    // 2. Traz a nova lista da Wizards of the Coast (Scryfall)
    console.log("-> Fetching latest keywords from Scryfall catalog...");
    const endpoints = [
        'https://api.scryfall.com/catalog/keyword-abilities',
        'https://api.scryfall.com/catalog/keyword-actions'
    ];
    
    const results = await Promise.all(endpoints.map(fetchJson));
    const allScryfallKeywords = [...new Set([...results[0].data, ...results[1].data])];
    console.log(`-> Scryfall claims there are ${allScryfallKeywords.length} official mechanics.`);

    // 3. Verifica o que é novo e inédito
    const newKeywords = allScryfallKeywords.filter(kw => !existingData.keywords[kw.toLowerCase()]);
    
    if (newKeywords.length === 0) {
        console.log("-> SUCCESS: Your dictionary is already 100% up to date! Nothing to translate.");
        return;
    }

    console.log(`-> Discovered ${newKeywords.length} NEW mechanics never translated before!`);
    if (!GEMINI_API_KEY) {
        console.warn("-> SKIPPING AI TRANSLATION: Secret GEMINI_API_KEY was not provided. Exiting gracefully.");
        return;
    }

    // 4. Invoca o Google Gemini iterativamente para as novas mecânicas (respeitando limite de API de 1 a cada 3s)
    let addedCount = 0;
    for (let i = 0; i < newKeywords.length; i++) {
        const word = newKeywords[i];
        console.log(`[${i+1}/${newKeywords.length}] Asking AI to translate: "${word}"...`);
        try {
            const aiTranslation = await translateWithGemini(word);
            
            existingData.keywords[word.toLowerCase()] = {
                name: word,
                translatedName: aiTranslation.translatedName || word,
                definition: aiTranslation.definition || `No definition found for ${word}`,
                lastUpdated: Date.now()
            };
            
            addedCount++;
            // Throttling just to be a good citizen on the Free AI API Tier
            await new Promise(r => setTimeout(r, 4000)); 
            
        } catch (err) {
            console.error(`- Error trying to translate ${word}. Skipping...`);
        }
    }

    // 5. Salva de volta no sistema (Re-empacota e deixa pronto pro Release do Github Actions)
    if (addedCount > 0) {
        console.log(`-> Translation Phase Finished. Successfully synthesized ${addedCount} new mechanics to PT-BR!`);
        fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(existingData, null, 2), 'utf8');
        console.log("-> 💾 Overwritten public/keywords.json to match AI learning session.");
    }
}

runAutoTranslator().catch(console.error);
