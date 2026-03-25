import axios from 'axios';
import { db, SyncStatus } from './db';
import { ScryfallCard } from './scryfall';

const BULK_DATA_API = 'https://api.scryfall.com/bulk-data';

export class BulkDataService {
  async getSyncStatus(): Promise<SyncStatus | undefined> {
    return await db.syncStatus.get('oracle_cards');
  }

  async syncCards(onProgress?: (progress: number, total: number) => void) {
    try {
      // 1. Get bulk data metadata
      const metaResponse = await axios.get(BULK_DATA_API);
      const oracleCardsMeta = metaResponse.data.data.find((d: any) => d.type === 'oracle_cards');
      
      if (!oracleCardsMeta) {
        throw new Error('Could not find oracle_cards bulk data metadata');
      }

      // 2. Update status to syncing
      await db.syncStatus.put({
        id: 'oracle_cards',
        lastSync: Date.now(),
        totalCards: 0,
        status: 'syncing'
      });

      // 3. Download the large JSON file
      // Note: In a browser, downloading a 100MB+ file can be memory intensive.
      // We'll use fetch with a stream if possible, but for simplicity we'll start with axios.
      const response = await axios.get(oracleCardsMeta.download_uri, {
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            onProgress(progressEvent.loaded, progressEvent.total);
          }
        }
      });

      const cards: ScryfallCard[] = response.data;
      const total = cards.length;

      // 4. Clear old data and insert new data in chunks to avoid blocking the UI thread
      await db.allCards.clear();
      
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < cards.length; i += CHUNK_SIZE) {
        const chunk = cards.slice(i, i + CHUNK_SIZE);
        await db.allCards.bulkAdd(chunk);
        if (onProgress) {
          onProgress(i + chunk.length, total);
        }
      }

      // 5. Update status to idle
      await db.syncStatus.put({
        id: 'oracle_cards',
        lastSync: Date.now(),
        totalCards: total,
        status: 'idle'
      });

      return total;
    } catch (error: any) {
      console.error('Bulk data sync error:', error);
      await db.syncStatus.put({
        id: 'oracle_cards',
        lastSync: Date.now(),
        totalCards: 0,
        status: 'error',
        error: error.message
      });
      throw error;
    }
  }

  async searchLocal(query: string, limit: number = 20): Promise<ScryfallCard[]> {
    if (!query) return [];
    
    // Simple search by name
    return await db.allCards
      .where('name')
      .startsWithIgnoreCase(query)
      .limit(limit)
      .toArray();
  }

  async getCardByNameLocal(name: string): Promise<ScryfallCard | null> {
    const card = await db.allCards.where('name').equals(name).first();
    return card || null;
  }
}

export const bulkDataService = new BulkDataService();
