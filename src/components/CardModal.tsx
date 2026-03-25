import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Languages, BookOpen, Info, ExternalLink, Loader2, HelpCircle, Sparkles } from 'lucide-react';
import { ScryfallCard, scryfall, ScryfallRule } from '../lib/scryfall';
import { translateToPTBR, translateRules } from '../lib/gemini';
import { cn } from '../lib/utils';
import { keywordService } from '../lib/keywordService';

interface CardModalProps {
  card: ScryfallCard;
  onClose: () => void;
}

export const CardModal: React.FC<CardModalProps> = ({ card: initialCard, onClose }) => {
  const [card, setCard] = useState<ScryfallCard>(initialCard);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedRules, setTranslatedRules] = useState<string[]>([]);
  const [rules, setRules] = useState<ScryfallRule[]>([]);
  const [loadingTranslation, setLoadingTranslation] = useState(false);
  const [loadingRules, setLoadingRules] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'rules'>('details');
  const [isTranslateActive, setIsTranslateActive] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [keywordDefinition, setKeywordDefinition] = useState<string | null>(null);
  const [loadingKeyword, setLoadingKeyword] = useState(false);
  const [keywordsLoaded, setKeywordsLoaded] = useState(false);

  useEffect(() => {
    const initKeywords = async () => {
      await keywordService.initialize();
      setKeywordsLoaded(true);
    };
    initKeywords();
  }, []);

  const handleKeywordClick = async (keyword: string) => {
    setSelectedKeyword(keyword);
    setLoadingKeyword(true);
    try {
      const definition = await keywordService.getDefinition(keyword);
      setKeywordDefinition(definition);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingKeyword(false);
    }
  };

  const getKeywordsInText = (text: string) => {
    return keywordService.findKeywordsInText(text);
  };

  const renderText = (text: string) => {
    return text;
  };

  // Try to fetch Portuguese version of the card on mount
  useEffect(() => {
    const localizeCard = async () => {
      // If already in Portuguese, no need to localize
      if (initialCard.lang === 'pt') {
        console.log("Card already in PT-BR:", initialCard.name);
        return;
      }
      
      console.log("Attempting to localize card:", initialCard.name, initialCard.oracle_id);
      try {
        const ptCard = await scryfall.getLocalizedCard(initialCard.oracle_id, 'pt', initialCard.set);
        if (ptCard) {
          console.log("Found PT-BR version:", ptCard.name);
          setCard(ptCard);
          // Reset any manual translations since we now have the official one
          setTranslatedText(null);
          setTranslatedRules([]);
        } else {
          console.log("No official PT-BR version found for:", initialCard.name);
        }
      } catch (error) {
        console.error("Error localizing card:", error);
      }
    };
    localizeCard();
  }, [initialCard.id, initialCard.oracle_id, initialCard.set]);

  useEffect(() => {
    const fetchRules = async () => {
      const oracleId = card.oracle_id;
      const cardId = card.id;
      
      if (!oracleId && !cardId) return;
      
      setLoadingRules(true);
      try {
        let fetchedRules: ScryfallRule[] = [];
        if (oracleId) {
          fetchedRules = await scryfall.getCardRules(oracleId, true);
        }
        
        // If no rules found by oracle ID, try by specific card ID
        if (fetchedRules.length === 0 && cardId) {
          fetchedRules = await scryfall.getCardRules(cardId, false);
        }
        
        setRules(fetchedRules);
      } catch (error) {
        console.error("Error fetching rules:", error);
      } finally {
        setLoadingRules(false);
      }
    };
    fetchRules();
  }, [card.id, card.oracle_id]);

  // Auto-translate rules if they load after translation was requested
  useEffect(() => {
    if (isTranslateActive && rules.length > 0 && translatedRules.length === 0 && !loadingTranslation) {
      const translateR = async () => {
        setLoadingTranslation(true);
        try {
          const ruleComments = rules.map(r => r.comment);
          const translatedR = await translateRules(ruleComments);
          setTranslatedRules(translatedR);
        } catch (error) {
          console.error(error);
        } finally {
          setLoadingTranslation(false);
        }
      };
      translateR();
    }
  }, [isTranslateActive, rules, translatedRules.length, loadingTranslation]);

  const handleTranslate = async () => {
    setIsTranslateActive(true);
    setLoadingTranslation(true);
    try {
      const textToTranslate = getOracleText();
      const ruleComments = rules.map(r => r.comment);

      // Parallelize translation of text and rules using Gemini
      const [translated, translatedR] = await Promise.all([
        translateToPTBR(textToTranslate, 'oracle'),
        ruleComments.length > 0 ? translateRules(ruleComments) : Promise.resolve([])
      ]);

      setTranslatedText(translated);
      if (translatedR.length > 0) {
        setTranslatedRules(translatedR);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingTranslation(false);
    }
  };

  const getOracleText = () => {
    if (card.printed_text) return card.printed_text;
    if (card.oracle_text) return card.oracle_text;
    if (card.card_faces) {
      return card.card_faces.map(f => {
        const name = (f as any).printed_name || f.name;
        const text = (f as any).printed_text || f.oracle_text;
        return `${name}:\n${text}`;
      }).join('\n\n');
    }
    return "Sem texto oracle disponível.";
  };

  const isPlaceholder = card.image_status === 'placeholder' || card.image_status === 'missing';
  const cardImage = (!isPlaceholder) 
    ? (card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal)
    : (initialCard.image_uris?.normal || initialCard.card_faces?.[0]?.image_uris?.normal);

  const formatLegality = (status: string) => {
    if (!status) return { label: 'Desconhecido', color: 'text-white/10 bg-white/5 border-white/5' };
    
    switch (status) {
      case 'legal': return { label: 'Legal', color: 'text-green-400 bg-green-400/10 border-green-400/20' };
      case 'not_legal': return { label: 'Não Legal', color: 'text-white/20 bg-white/5 border-white/10' };
      case 'restricted': return { label: 'Restrita', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' };
      case 'banned': return { label: 'Banida', color: 'text-red-400 bg-red-400/10 border-red-400/20' };
      default: return { label: status.replace('_', ' '), color: 'text-white/40 bg-white/5 border-white/10' };
    }
  };

  const mainFormats = [
    { id: 'standard', name: 'Standard' },
    { id: 'pioneer', name: 'Pioneer' },
    { id: 'modern', name: 'Modern' },
    { id: 'legacy', name: 'Legacy' },
    { id: 'vintage', name: 'Vintage' },
    { id: 'commander', name: 'Commander' },
    { id: 'pauper', name: 'Pauper' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-black/90 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full h-full md:h-auto md:max-w-6xl md:max-h-[90vh] overflow-y-auto md:overflow-hidden md:rounded-[32px] border border-white/10 flex flex-col md:flex-row relative scroll-smooth bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button (Floating) */}
        <button
          onClick={onClose}
          className="fixed md:absolute top-4 right-4 z-[100] p-2 bg-black/60 hover:bg-white/10 rounded-full backdrop-blur-md transition-all border border-white/10 shadow-xl"
        >
          <X size={20} />
        </button>

        {/* Card Image Section - Sticky on Mobile */}
        <div className="w-full md:w-[42%] h-[50vh] md:h-full p-8 md:p-12 flex items-center justify-center bg-black md:bg-gradient-to-br md:from-purple-600/10 md:to-transparent border-b md:border-b-0 md:border-r border-white/5 shrink-0 sticky top-0 md:relative z-0">
          <motion.div 
            initial={{ rotateY: 20, rotateX: -10, opacity: 0, scale: 0.8 }}
            animate={{ rotateY: 0, rotateX: 0, opacity: 1, scale: 1 }}
            whileHover={{ rotateY: 0, rotateX: 0, scale: 1.05 }}
            transition={{ duration: 0.8, type: 'spring' }}
            className="relative group w-full max-w-[220px] md:max-w-none perspective-1000"
          >
            <div className="absolute -inset-4 bg-purple-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            <img
              src={cardImage}
              alt={card.name}
              className="w-full rounded-[4.75% / 3.5%] shadow-[0_30px_60px_rgba(0,0,0,0.8)] relative z-10"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </div>

        {/* Content Section - Slides over on Mobile */}
        <div className="flex-1 w-full flex flex-col min-h-screen md:min-h-0 md:overflow-y-auto relative z-[60] bg-black md:bg-transparent rounded-t-[40px] md:rounded-none -mt-16 md:mt-0 border-t md:border-t-0 border-white/10 shadow-[0_-40px_80px_rgba(0,0,0,1)] md:shadow-none">
          <div className="p-6 md:p-10 space-y-8 pb-32 bg-black md:bg-transparent rounded-t-[40px] md:rounded-none relative z-[70]">
            {/* Header Info */}
            <div className="space-y-2 relative z-[80]">
              <div className="flex items-center gap-2 text-purple-400 font-mono text-[10px] uppercase tracking-[0.3em] font-bold">
                <Sparkles size={12} /> {card.set_name} • {card.rarity}
              </div>
              <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight leading-none">
                {card.printed_name || card.name}
              </h2>
              <p className="text-white/40 font-mono text-xs md:text-sm uppercase tracking-widest">
                {card.type_line}
              </p>
            </div>

            {/* Tabs Navigation */}
            <div className="flex p-1 bg-white/10 rounded-2xl w-fit relative z-[80]">
              <button
                onClick={() => setActiveTab('details')}
                className={cn(
                  "px-6 py-2 rounded-xl text-xs font-bold transition-all",
                  activeTab === 'details' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                )}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={cn(
                  "px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'rules' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                )}
              >
                Rules <span className="opacity-40">{rules.length}</span>
              </button>
            </div>

            {activeTab === 'details' ? (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8 relative z-[80]"
              >
                {/* Oracle Text */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] uppercase tracking-[0.3em] text-white/20 font-black">Oracle Text</h3>
                    {!translatedText && (
                      <button
                        onClick={handleTranslate}
                        disabled={loadingTranslation}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 px-4 py-2 rounded-full transition-all disabled:opacity-50 border border-purple-500/20"
                      >
                        {loadingTranslation ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                        Translate to PT-BR
                      </button>
                    )}
                  </div>
                  
                  <div className="p-6 bg-white/[0.08] rounded-3xl border border-white/10 text-sm md:text-lg leading-relaxed whitespace-pre-wrap font-serif text-white/80 relative z-[80]">
                    {renderText(getOracleText())}
                  </div>

                  {translatedText && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-purple-400 font-black">
                        <Languages size={12} /> Portuguese Translation
                      </div>
                      <div className="p-6 bg-purple-500/5 rounded-3xl border border-purple-500/10 text-sm md:text-lg leading-relaxed whitespace-pre-wrap italic font-serif text-purple-100/90">
                        {renderText(translatedText)}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Keywords */}
                {(() => {
                  const foundStrings = [
                    ...getKeywordsInText(getOracleText()),
                    ...(translatedText ? getKeywordsInText(translatedText) : [])
                  ];
                  
                  const keywordMap = new Map<string, string>();
                  const allDefs = keywordService.getAllDefinitions();
                  
                  foundStrings.forEach(str => {
                    const key = keywordService.getKeywordKey(str);
                    if (key && allDefs[key]) {
                      const def = allDefs[key];
                      keywordMap.set(key, def.translatedName || def.name);
                    }
                  });
                  
                  const uniqueKeywords = Array.from(keywordMap.values());
                  
                  if (uniqueKeywords.length > 0) {
                    return (
                      <div className="space-y-4 relative z-[80]">
                        <h3 className="text-[10px] uppercase tracking-[0.3em] text-white/20 font-black">Keywords Identified</h3>
                        <div className="flex flex-wrap gap-2">
                          {uniqueKeywords.map((kw, i) => (
                            <button
                              key={`${kw}-${i}`}
                              onClick={() => handleKeywordClick(kw)}
                              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-purple-500/20 border border-white/5 hover:border-purple-500/30 rounded-full text-xs font-bold transition-all group"
                            >
                              {kw}
                              <HelpCircle size={14} className="opacity-20 group-hover:opacity-100 transition-opacity" />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Legalities */}
                <div className="space-y-4 relative z-[80]">
                  <h3 className="text-[10px] uppercase tracking-[0.3em] text-white/20 font-black">Format Legality</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {card.legalities ? mainFormats.map((format) => {
                      const status = (card.legalities as any)[format.id];
                      const { label, color } = formatLegality(status);
                      return (
                        <div key={format.id} className={cn("px-3 py-2 rounded-xl border text-[10px] font-bold flex flex-col gap-1", color)}>
                          <span className="opacity-40 uppercase tracking-tighter">{format.name}</span>
                          <span className="text-xs">{label}</span>
                        </div>
                      );
                    }) : null}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6 relative z-[80]"
              >
                {loadingRules ? (
                  <div className="flex flex-col items-center justify-center py-20 text-white/20">
                    <Loader2 className="animate-spin mb-4 text-purple-500" size={40} />
                    <p className="text-xs uppercase tracking-[0.2em] font-bold">Consulting Judge...</p>
                  </div>
                ) : rules.length === 0 ? (
                  <div className="text-center py-20 bg-white/[0.02] rounded-[32px] border border-dashed border-white/10">
                    <Info className="mx-auto mb-4 opacity-20" size={48} />
                    <p className="text-sm text-white/40">No specific rulings found for this card.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {rules.map((rule, idx) => (
                      <div key={idx} className="group">
                        <div className="p-6 bg-white/[0.03] rounded-3xl border border-white/5 group-hover:border-white/10 transition-colors">
                          <div className="flex items-center gap-2 mb-3 text-[10px] font-mono text-white/20 uppercase tracking-widest">
                            <BookOpen size={12} /> {rule.published_at}
                          </div>
                          <p className="text-sm md:text-base text-white/70 leading-relaxed">{rule.comment}</p>
                        </div>
                        {translatedRules[idx] && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-3 p-6 bg-purple-500/5 rounded-3xl border border-purple-500/10 text-sm md:text-base italic text-purple-100/80 font-serif"
                          >
                            {translatedRules[idx]}
                          </motion.div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Action Footer */}
          <div className="p-6 md:p-8 border-t border-white/5 bg-[#030303] md:backdrop-blur-xl sticky bottom-0 z-[80]">
            <a
              href={card.scryfall_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-purple-500 hover:text-white transition-all active:scale-[0.98] text-xs uppercase tracking-[0.2em]"
            >
              View on Scryfall <ExternalLink size={16} />
            </a>
          </div>
        </div>

        {/* Keyword Definition Overlay */}
        <AnimatePresence>
          {selectedKeyword && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
              onClick={() => {
                setSelectedKeyword(null);
                setKeywordDefinition(null);
              }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="w-full max-w-lg glass-surface rounded-[32px] p-8 border border-purple-500/30 shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                      <BookOpen size={20} className="text-purple-400" />
                    </div>
                    <h4 className="font-display text-2xl font-bold tracking-tight capitalize">{selectedKeyword}</h4>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedKeyword(null);
                      setKeywordDefinition(null);
                    }}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="min-h-[120px] flex flex-col justify-center">
                  {loadingKeyword ? (
                    <div className="flex flex-col items-center gap-4 py-6 text-white/20">
                      <Loader2 size={32} className="animate-spin text-purple-500" />
                      <p className="text-[10px] uppercase tracking-[0.2em] font-black">Consulting Rules...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <p className="text-white/80 leading-relaxed text-lg font-serif italic">
                        "{keywordDefinition}"
                      </p>
                      <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                        <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] font-bold">
                          Comprehensive Rules (AI Translated)
                        </p>
                        <Sparkles size={14} className="text-purple-500/40" />
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};
