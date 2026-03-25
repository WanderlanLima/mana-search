import { create } from 'zustand';
import { ScryfallCard } from '../lib/scryfall';

interface AppState {
  // Search State
  query: string;
  setQuery: (q: string) => void;
  cards: ScryfallCard[];
  setCards: (updater: ScryfallCard[] | ((prev: ScryfallCard[]) => ScryfallCard[])) => void;
  loading: boolean;
  setLoading: (l: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
  page: number;
  setPage: (p: number) => void;
  hasMore: boolean;
  setHasMore: (h: boolean) => void;
  
  // Autocomplete State
  suggestions: string[];
  setSuggestions: (s: string[]) => void;
  quickResults: ScryfallCard[];
  setQuickResults: (r: ScryfallCard[]) => void;
  loadingSuggestions: boolean;
  setLoadingSuggestions: (l: boolean) => void;
  
  // Navigation & Modals
  activeTab: 'search' | 'decks';
  setActiveTab: (tab: 'search' | 'decks') => void;
  selectedDeckId: number | null;
  setSelectedDeckId: (id: number | null) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isCameraOpen: boolean;
  setIsCameraOpen: (open: boolean) => void;
  isNightmareOpen: boolean;
  setIsNightmareOpen: (open: boolean) => void;
  selectedCard: ScryfallCard | null;
  setSelectedCard: (card: ScryfallCard | null) => void;
  showKeywordsOnly: boolean;
  setShowKeywordsOnly: (show: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
  cards: [],
  setCards: (updater) => set((state) => ({ 
    cards: typeof updater === 'function' ? updater(state.cards) : updater 
  })),
  loading: false,
  setLoading: (loading) => set({ loading }),
  error: null,
  setError: (error) => set({ error }),
  page: 1,
  setPage: (page) => set({ page }),
  hasMore: false,
  setHasMore: (hasMore) => set({ hasMore }),
  
  suggestions: [],
  setSuggestions: (suggestions) => set({ suggestions }),
  quickResults: [],
  setQuickResults: (quickResults) => set({ quickResults }),
  loadingSuggestions: false,
  setLoadingSuggestions: (loadingSuggestions) => set({ loadingSuggestions }),
  
  activeTab: 'search',
  setActiveTab: (activeTab) => set({ activeTab }),
  selectedDeckId: null,
  setSelectedDeckId: (selectedDeckId) => set({ selectedDeckId }),
  isSettingsOpen: false,
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  isCameraOpen: false,
  setIsCameraOpen: (isCameraOpen) => set({ isCameraOpen }),
  isNightmareOpen: false,
  setIsNightmareOpen: (isNightmareOpen) => set({ isNightmareOpen }),
  selectedCard: null,
  setSelectedCard: (selectedCard) => set({ selectedCard }),
  showKeywordsOnly: false,
  setShowKeywordsOnly: (showKeywordsOnly) => set({ showKeywordsOnly }),
}));
