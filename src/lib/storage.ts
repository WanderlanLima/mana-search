
export const storage = {
  getGeminiKey: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('user_gemini_api_key');
  },
  
  setGeminiKey: (key: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('user_gemini_api_key', key.trim());
  },
  
  clearGeminiKey: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('user_gemini_api_key');
  },
  
  getDbVersion: (): string => {
    if (typeof window === 'undefined') return 'v1.0 (Fábrica)';
    return localStorage.getItem('phash_db_version') || 'v1.0 (Fábrica)';
  },
  
  setDbVersion: (version: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('phash_db_version', version);
  }
};
