// Generate ManaBox-Style Offline pHash SQLite Database
// Execute via: node scripts/generate_phash_db.js
// Requirements: npm install jimp sqlite3 (Run this within this folder or project root)

const fs = require('fs');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const Jimp = require('jimp');

const DB_FILE = './public/cards.db'; // Output to the public folder to be served to the App

async function initDB() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_FILE, (err) => {
            if (err) reject(err);
        });
        db.run(`CREATE TABLE IF NOT EXISTS cards (
            id TEXT PRIMARY KEY,
            name TEXT,
            phash TEXT,
            set_code TEXT,
            collector_number TEXT
        )`, (err) => {
            if (err) reject(err);
            resolve(db);
        });
    });
}

async function computeAHash(url) {
    return new Promise((resolve, reject) => {
        // Fetch image visually replicating Android Native Hash bounds
        Jimp.read(url)
            .then(image => {
                image.grayscale();
                
                // Android Bound: x=10%, y=15%, w=80%, h=40% (Isolating the Art exactly identically to CardDetector.kt)
                const w = image.bitmap.width;
                const h = image.bitmap.height;
                image.crop(w * 0.1, h * 0.15, w * 0.8, h * 0.40);
                
                image.resize(8, 8); // Collapse into 64 pixels matrix
                
                let sum = 0;
                const pixels = [];
                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 8; x++) {
                        const color = image.getPixelColor(x, y);
                        const rgb = Jimp.intToRGBA(color);
                        sum += rgb.r;
                        pixels.push(rgb.r);
                    }
                }
                const mean = sum / 64;
                
                let binaryStr = '';
                for (const px of pixels) {
                    binaryStr += px >= mean ? '1' : '0';
                }
                resolve(BigInt('0b' + binaryStr).toString(16).padStart(16, '0'));
            })
            .catch(err => {
                resolve(null); // Return null on broken image links rather than crashing
            });
    });
}

const reqOptions = {
    headers: { 'User-Agent': 'ManaSearch/1.0', 'Accept': '*/*' }
};

async function fetchBulkData() {
    return new Promise((resolve, reject) => {
        https.get('https://api.scryfall.com/bulk-data', reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const bulkMeta = JSON.parse(data);
                    if (!bulkMeta.data) throw new Error("API returned error: " + data);
                    const defaultCardsData = bulkMeta.data.find(d => d.type === 'default_cards');
                    resolve(defaultCardsData.download_uri);
                } catch(e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function downloadJSON(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        
        const requestUrl = (targetUrl) => {
            https.get(targetUrl, reqOptions, function(response) {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    return requestUrl(response.headers.location); // Follow Redirection
                }
                response.pipe(file);
                file.on('finish', function() {
                    file.close(resolve);
                });
            }).on('error', function(err) {
                fs.unlink(dest, () => reject(err));
            });
        };
        
        requestUrl(url);
    });
}

async function parseAndHashCards() {
    console.log("-> Initializing Offline Database Engine...");
    const db = await initDB();
    
    console.log("-> Fetching latest Scryfall Bulk Metadata...");
    const uri = await fetchBulkData();
    
    const tempFile = 'scryfall_temp.json';
    console.log("-> Downloading 350MB card definitions (This will take a moment)...");
    await downloadJSON(uri, tempFile);
    
    console.log("-> Reading definitions...");
    const cards = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
    fs.unlinkSync(tempFile);
    
    console.log(`-> Discovered ${cards.length} cards. Filtering normal/small images...`);
    
    // We filter cards that have normal images
    const targetCards = cards.filter(c => c.image_uris && c.image_uris.small);
    const total = targetCards.length;
    console.log(`-> Computations required: ${total} Hashes. Commencing Loop (Press Ctrl+C to pause).`);
    
    // Process purely synchronously or throttled to respect API
    for (let i = 0; i < total; i++) {
        const card = targetCards[i];
        
        // Skip if already in database (Allows Script resuming)
        const exists = await new Promise(r => db.get('SELECT 1 FROM cards WHERE id = ?', [card.id], (err, row) => r(!!row)));
        if (exists) continue;
        
        try {
            const hash = await computeAHash(card.image_uris.small);
            if (hash) {
                db.run('INSERT INTO cards (id, name, phash, set_code, collector_number) VALUES (?, ?, ?, ?, ?)', 
                    [card.id, card.name, hash, card.set, card.collector_number]);
                console.log(`[${i+1}/${total}] Extracted: ${card.name} -> ${hash}`);
            }
        } catch(e) {
            console.error(`Failed to process ${card.name}`, e);
        }
        
        // Wait 100ms to avoid Google/Scryfall rate limits on Jimp fetching images
        await new Promise(r => setTimeout(r, 100));
    }
    
    console.log("Database compilation COMPLETE!");
}

parseAndHashCards().catch(console.error);
