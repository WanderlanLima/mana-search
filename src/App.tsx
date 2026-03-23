import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Loader2, Sparkles, History, X, ChevronRight, ChevronLeft, Menu } from 'lucide-react';
import { scryfall, ScryfallCard } from './lib/scryfall';
import { CardItem } from './components/CardItem';
import { CardModal } from './components/CardModal';
import { cn } from './lib/utils';

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
      setError(err.response?.data?.details || 'Erro ao buscar cartas. Tente novamente.');
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

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-white selection:text-black">
      {/* Header / Search Bar */}
      <header className="sticky top-0 z-40 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <Sparkles className="text-black" size={18} />
              </div>
              <h1 className="text-xl font-bold tracking-tighter">MANA SEARCH</h1>
            </div>
            <button className="p-2 hover:bg-white/5 rounded-full md:hidden">
              <Menu size={20} />
            </button>
          </div>

          <form onSubmit={onSearchSubmit} className="relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-white transition-colors">
              <Search size={18} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder="Busque por nome, tipo, cor (ex: oracle:draw c:u)..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:bg-white/10 transition-all placeholder:text-white/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
              >
                <X size={16} />
              </button>
            )}

            {/* Dropdown (History + Suggestions + Previews) */}
            <AnimatePresence>
              {showDropdown && (query.length > 0 || history.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-[#121212] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50 max-h-[80vh] overflow-y-auto"
                >
                  <div className="p-2 space-y-4">
                    {/* Quick Previews */}
                    {quickResults.length > 0 && (
                      <div className="px-2">
                        <div className="px-1 py-2 text-[10px] uppercase tracking-widest text-white/30 font-bold">
                          Prévia de Cartas
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {quickResults.map((card) => (
                            <button
                              key={card.id}
                              type="button"
                              onClick={() => {
                                setSelectedCard(card);
                                setShowDropdown(false);
                              }}
                              className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl text-left transition-colors group"
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
                                <p className="text-xs font-bold truncate group-hover:text-white">{card.name}</p>
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
                          Sugestões
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
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-xl text-sm text-left transition-colors"
                            >
                              <Search size={14} className="text-white/30" />
                              <span className="flex-1 truncate">{s}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* History */}
                    {query.length === 0 && history.length > 0 && (
                      <div className="px-2">
                        <div className="flex items-center justify-between px-1 py-2 text-[10px] uppercase tracking-widest text-white/30 font-bold">
                          <span>Buscas Recentes</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setHistory([]);
                              localStorage.removeItem('mtg_search_history');
                            }}
                            className="hover:text-white transition-colors"
                          >
                            Limpar
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
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-xl text-sm text-left transition-colors"
                            >
                              <History size={14} className="text-white/30" />
                              <span className="flex-1 truncate">{h}</span>
                              <ChevronRight size={14} className="text-white/10" />
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
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Error State */}
        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-start gap-3">
            <div className="mt-0.5">⚠️</div>
            <p>{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && cards.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6">
              <Search size={32} className="text-white/20" />
            </div>
            <h2 className="text-xl font-bold mb-2">Encontre sua próxima jogada</h2>
            <p className="text-white/40 text-sm max-w-xs mx-auto">
              Use a sintaxe do Scryfall para buscas avançadas. Tradução automática inclusa.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {['t:creature c:r', 'oracle:draw', 'rarity:mythic', 'set:one'].map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    setQuery(tag);
                    handleSearch(tag, 1);
                  }}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs hover:bg-white/10 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onClick={setSelectedCard}
            />
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="animate-spin text-white/40 mb-2" size={32} />
            <p className="text-sm text-white/40 font-mono uppercase tracking-widest">Buscando...</p>
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && (
          <div className="mt-12 flex justify-center">
            <button
              onClick={loadMore}
              className="px-8 py-4 bg-white text-black font-bold rounded-2xl hover:bg-white/90 transition-all active:scale-95 text-sm uppercase tracking-widest"
            >
              Carregar Mais
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 text-center">
        <p className="text-[10px] text-white/20 uppercase tracking-[0.2em]">
          Powered by Scryfall API & Gemini AI
        </p>
      </footer>

      {/* Modal */}
      <AnimatePresence>
        {selectedCard && (
          <CardModal
            key={selectedCard.id}
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
          />
        )}
      </AnimatePresence>

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
