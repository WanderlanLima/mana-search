import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Loader2, Sparkles, History, X, ChevronRight, ChevronLeft, Menu, ArrowLeft, ArrowRight, HelpCircle, Settings, Camera, Ghost, Layout, Database } from 'lucide-react';
import { scryfall, ScryfallCard } from './lib/scryfall';
import { CardItem } from './components/CardItem';
import { CardModal } from './components/CardModal';
import { NightmareStatus } from './components/NightmareStatus';
import { SettingsModal } from './components/SettingsModal';
import { CameraScanner } from './components/CameraScanner';
import { DeckList } from './components/DeckList';
import { DeckView } from './components/DeckView';
import { cn } from './lib/utils';
import { keywordService } from './lib/keywordService';

export default function App() {
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [quickResults, setQuickResults] = useState<ScryfallCard[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [nightmareClicks, setNightmareClicks] = useState(0);
  const [isNightmareOpen, setIsNightmareOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showKeywordsOnly, setShowKeywordsOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'decks'>('search');
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [keywordSearch, setKeywordSearch] = useState('');
  const nightmareTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Initialize keyword service on startup
  useEffect(() => {
    keywordService.initialize();
  }, []);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('mtg_search_history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  // Debounced Autocomplete
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 3) {
        setLoadingSuggestions(true);
        try {
          // Parallelize autocomplete and quick results
          const [names, searchData] = await Promise.all([
            scryfall.getAutocomplete(query),
            scryfall.search(query, 1)
          ]);
          
          setSuggestions(names);
          setQuickResults(searchData.data.slice(0, 4));
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingSuggestions(false);
        }
      } else {
        setSuggestions([]);
        setQuickResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const saveToHistory = (q: string) => {
    if (!q.trim()) return;
    const newHistory = [q, ...history.filter(h => h !== q)].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('mtg_search_history', JSON.stringify(newHistory));
  };

  const handleSearch = useCallback(async (searchQuery: string, searchPage: number = 1) => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    setShowDropdown(false);
    setShowKeywordsOnly(false);
    try {
      const data = await scryfall.search(searchQuery, searchPage);
      if (searchPage === 1) {
        setCards(data.data);
      } else {
        setCards(prev => [...prev, ...data.data]);
      }
      setHasMore(data.has_more);
      saveToHistory(searchQuery);
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar cartas. Tente novamente.');
      if (searchPage === 1) setCards([]);
    } finally {
      setLoading(false);
    }
  }, [history]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    handleSearch(query, 1);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    handleSearch(query, nextPage);
  };

  const handleNightmareClick = () => {
    const newClicks = nightmareClicks + 1;
    setNightmareClicks(newClicks);
    
    if (newClicks >= 10) {
      setIsNightmareOpen(true);
      setNightmareClicks(0);
    }

    // Reset clicks after 2 seconds of inactivity
    if (nightmareTimerRef.current) clearTimeout(nightmareTimerRef.current);
    nightmareTimerRef.current = setTimeout(() => setNightmareClicks(0), 2000);
  };

  const searchKeywordsOnly = async () => {
    setShowKeywordsOnly(true);
    setKeywordSearch('');
    setCards([]);
    setHasMore(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-purple-500/30">
      {/* Background Effects */}
      <div className="atmosphere" />
      
      {/* Header */}
      <header className="sticky top-0 z-40 glass-surface border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer select-none active:scale-95 transition-transform"
            onClick={handleNightmareClick}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Sparkles size={18} className="text-white" />
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight text-gradient">
              Mana Search
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center bg-white/5 rounded-xl p-1 mr-4">
              <button
                onClick={() => {
                  setActiveTab('search');
                  setSelectedDeckId(null);
                  setShowKeywordsOnly(false);
                }}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === 'search' && !showKeywordsOnly ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
                )}
              >
                Search
              </button>
              <button
                onClick={() => {
                  setActiveTab('decks');
                  setSelectedDeckId(null);
                  setShowKeywordsOnly(false);
                }}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === 'decks' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
                )}
              >
                Decks
              </button>
            </nav>
            <button 
              onClick={() => setIsNightmareOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-full transition-all group"
            >
              <Ghost size={14} className="text-purple-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">Status</span>
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-colors"
              title="Configurações"
            >
              <Settings size={20} />
            </button>
            <button className="p-2 hover:bg-white/5 rounded-full md:hidden">
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Error State */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-start gap-3"
          >
            <div className="mt-0.5">⚠️</div>
            <p>{error}</p>
          </motion.div>
        )}

        {activeTab === 'decks' ? (
          selectedDeckId ? (
            <DeckView 
              deckId={selectedDeckId} 
              onBack={() => setSelectedDeckId(null)} 
              onSelectCard={async (scryfallId) => {
                try {
                  const card = await scryfall.getCardById(scryfallId);
                  setSelectedCard(card);
                } catch (e) {
                  console.error("Error loading card details:", e);
                }
              }}
            />
          ) : (
            <DeckList onSelectDeck={setSelectedDeckId} />
          )
        ) : (
          <>
            {/* Search Section */}
            {!showKeywordsOnly && (
          <div className="max-w-2xl mx-auto mb-12 md:mb-20">
            <div className="text-center mb-8">
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-display text-4xl md:text-6xl font-bold mb-4 tracking-tight"
              >
                Find your next <span className="text-purple-500">Magic</span>.
              </motion.h2>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-white/40 text-sm md:text-base max-w-md mx-auto"
              >
                Search through thousands of cards with the power of Nightmare cataloging.
              </motion.p>
            </div>

            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
              <form onSubmit={onSearchSubmit} className="relative flex items-center glass-surface rounded-2xl overflow-hidden p-1 glow-purple">
                <div className="pl-4 text-white/40 group-focus-within:text-purple-400 transition-colors">
                  <Search size={20} />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search cards (e.g. Yuriko, Tiger's Shadow)"
                  className="w-full bg-transparent border-none focus:ring-0 px-4 py-4 text-lg placeholder:text-white/20"
                />
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="p-3 text-white/40 hover:text-purple-400 transition-colors"
                  title="Scan Card"
                >
                  <Camera size={24} />
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-2 mr-1"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Search'}
                </button>
              </form>

              {/* Dropdown */}
              <AnimatePresence>
                {showDropdown && (query.length > 0 || history.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full left-0 right-0 mt-2 glass-surface rounded-2xl overflow-hidden shadow-2xl z-50 max-h-[80vh] overflow-y-auto"
                  >
                    <div className="p-2 space-y-4">
                      {/* Quick Previews */}
                      {quickResults.length > 0 && (
                        <div className="px-2">
                          <div className="px-1 py-2 text-[10px] uppercase tracking-widest text-white/30 font-bold">
                            Card Previews
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {quickResults.map((card) => (
                              <button
                                key={card.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCard(card);
                                  setShowDropdown(false);
                                }}
                                className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl text-left transition-colors group border border-transparent hover:border-white/5"
                              >
                                <div className="w-10 h-14 bg-white/5 rounded overflow-hidden flex-shrink-0">
                                  <img 
                                    src={card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small} 
                                    alt={card.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold truncate group-hover:text-purple-400 transition-colors">{card.name}</p>
                                  <p className="text-[10px] text-white/40 truncate">{card.type_line}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Suggestions */}
                      {suggestions.length > 0 && (
                        <div className="px-2">
                          <div className="px-1 py-2 text-[10px] uppercase tracking-widest text-white/30 font-bold">
                            Suggestions
                          </div>
                          <div className="space-y-1">
                            {suggestions.map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  setQuery(s);
                                  handleSearch(s, 1);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-xl text-sm text-left transition-colors group"
                              >
                                <Search size={14} className="text-white/30 group-hover:text-purple-400" />
                                <span className="flex-1 truncate text-white/60 group-hover:text-white">{s}</span>
                                <ArrowRight size={14} className="opacity-0 group-hover:opacity-40 -translate-x-2 group-hover:translate-x-0 transition-all" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* History */}
                      {query.length === 0 && history.length > 0 && (
                        <div className="px-2">
                          <div className="flex items-center justify-between px-1 py-2 text-[10px] uppercase tracking-widest text-white/30 font-bold">
                            <span>Recent Searches</span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setHistory([]);
                                localStorage.removeItem('mtg_search_history');
                              }}
                              className="hover:text-white transition-colors"
                            >
                              Clear
                            </button>
                          </div>
                          <div className="space-y-1">
                            {history.map((h, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  setQuery(h);
                                  handleSearch(h, 1);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-xl text-sm text-left transition-colors group"
                              >
                                <History size={14} className="text-white/30 group-hover:text-purple-400" />
                                <span className="flex-1 truncate text-white/60 group-hover:text-white">{h}</span>
                                <ArrowRight size={14} className="opacity-0 group-hover:opacity-40 -translate-x-2 group-hover:translate-x-0 transition-all" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {loadingSuggestions && (
                        <div className="flex items-center justify-center py-4 text-white/20">
                          <Loader2 size={20} className="animate-spin" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Quick Tags */}
            {!query && (
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {['t:creature c:r', 'oracle:draw', 'rarity:mythic', 'set:one'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      setQuery(tag);
                      handleSearch(tag, 1);
                    }}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white transition-all"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Results Grid */}
        {!showKeywordsOnly && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-8">
            {cards.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                onClick={setSelectedCard}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && cards.length === 0 && !error && !showKeywordsOnly && (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-float">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 border border-white/10">
              <Search size={32} className="text-white/20" />
            </div>
            <h3 className="font-display text-xl font-bold mb-2">No cards found</h3>
            <p className="text-white/40 text-sm max-w-xs">Try searching for a card name, type, or keyword.</p>
          </div>
        )}

        {/* Keywords View */}
        {showKeywordsOnly && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/5">
              <div>
                <button 
                  onClick={() => setShowKeywordsOnly(false)}
                  className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm font-bold mb-4 transition-colors group"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Search
                </button>
                <h2 className="font-display text-4xl font-bold tracking-tight">Keyword Dictionary</h2>
                <p className="text-white/40 mt-2">Explore the technical mechanics of Magic: The Gathering.</p>
              </div>
              
              <div className="relative w-full md:w-80">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                  placeholder="Filter keywords..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(keywordService.getAllDefinitions())
                .filter(([key, def]) => {
                  if (!keywordSearch.trim()) return true;
                  const q = keywordSearch.toLowerCase();
                  return def.name.toLowerCase().includes(q) || 
                         (def.translatedName && def.translatedName.toLowerCase().includes(q)) ||
                         def.definition.toLowerCase().includes(q);
                })
                .map(([key, def]) => (
                  <motion.div
                    key={key}
                    layout
                    className="glass-surface p-6 rounded-2xl border border-white/5 hover:border-purple-500/30 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-display text-lg font-bold group-hover:text-purple-400 transition-colors">
                          {def.translatedName || def.name}
                        </h3>
                        {def.translatedName && (
                          <span className="text-[10px] font-mono uppercase tracking-widest text-white/20">
                            {def.name}
                          </span>
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/20 group-hover:text-purple-400 transition-colors">
                        <HelpCircle size={18} />
                      </div>
                    </div>
                    <p className="text-sm text-white/60 leading-relaxed">
                      {def.definition || 'No definition available.'}
                    </p>
                  </motion.div>
                ))}
            </div>
            
            {Object.keys(keywordService.getAllDefinitions()).length === 0 && (
              <div className="py-12 text-center text-white/20">
                Nenhuma keyword catalogada ainda.
              </div>
            )}
          </motion.div>
        )}

        {/* Loading State */}
        {loading && !showKeywordsOnly && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="animate-spin text-purple-500 mb-4" size={40} />
            <p className="text-sm text-white/40 font-mono uppercase tracking-widest">Scanning Multiverse...</p>
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && !showKeywordsOnly && (
          <div className="mt-12 flex justify-center">
            <button
              onClick={loadMore}
              className="px-8 py-4 bg-white text-black font-bold rounded-2xl hover:bg-purple-500 hover:text-white transition-all active:scale-95 text-xs uppercase tracking-[0.2em]"
            >
              Load More
            </button>
          </div>
        )}
      </>
    )}
  </main>

      {/* Mobile Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-surface border-t border-white/5 px-6 py-3">
        <div className="flex items-center justify-around max-w-md mx-auto">
          <button
            onClick={() => {
              setActiveTab('search');
              setSelectedDeckId(null);
              setShowKeywordsOnly(false);
            }}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === 'search' && !showKeywordsOnly ? "text-purple-400" : "text-white/40"
            )}
          >
            <Search size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Search</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('decks');
              setSelectedDeckId(null);
              setShowKeywordsOnly(false);
            }}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === 'decks' ? "text-purple-400" : "text-white/40"
            )}
          >
            <Layout size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Decks</span>
          </button>
          <button
            onClick={() => {
              setIsNightmareOpen(true);
            }}
            className="flex flex-col items-center gap-1 text-white/40"
          >
            <Ghost size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Status</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 mt-20 pb-24 md:pb-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-4 opacity-20">
            <Search size={16} />
            <span className="font-display font-bold tracking-tighter">MANA SEARCH</span>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20">
            Powered by Scryfall & Nightmare AI
          </p>
        </div>
      </footer>

      {/* Modals */}
      <AnimatePresence>
        {selectedCard && (
          <CardModal
            key={selectedCard.id}
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
          />
        )}
      </AnimatePresence>

      <NightmareStatus 
        isOpen={isNightmareOpen} 
        onClose={() => setIsNightmareOpen(false)} 
        onSearchKeywords={searchKeywordsOnly}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      <CameraScanner 
        isOpen={isCameraOpen} 
        onClose={() => setIsCameraOpen(false)} 
        onDetected={(name) => {
          setQuery(name);
          handleSearch(name, 1);
        }}
      />

      {/* Close history on click outside */}
      {showDropdown && (
        <div 
          className="fixed inset-0 z-30" 
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}
