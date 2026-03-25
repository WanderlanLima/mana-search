
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
  }
};
