import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Languages, BookOpen, Info, ExternalLink, Loader2 } from 'lucide-react';
import { ScryfallCard, scryfall, ScryfallRule } from '../lib/scryfall';
import { translateToPTBR, translateRules } from '../lib/gemini';
import { cn } from '../lib/utils';

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

      // Parallelize translation of text and rules
      const [translated, translatedR] = await Promise.all([
        translateToPTBR(textToTranslate),
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
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 40 }}
        className="bg-[#0a0a0a] w-full h-full md:h-auto md:max-w-5xl md:max-h-[90vh] overflow-hidden md:rounded-3xl border-t md:border border-white/10 flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card Image Section (Desktop) */}
        <div className="hidden md:flex w-[45%] p-10 items-center justify-center bg-gradient-to-b from-white/5 to-transparent border-r border-white/5 shrink-0">
          <div className="relative group w-full">
            <img
              src={cardImage}
              alt={card.name}
              className="w-full rounded-[4.75% / 3.5%] shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-transform duration-500 group-hover:scale-[1.02]"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* Mobile Image Header (Visible only on mobile) */}
          <div className="md:hidden w-full p-4 bg-gradient-to-b from-white/5 to-transparent border-b border-white/5 flex justify-center">
            <div className="w-full max-w-[200px]">
              <img
                src={cardImage}
                alt={card.name}
                className="w-full rounded-[4.75% / 3.5%] shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          <div className="p-5 md:p-6 border-b border-white/5 flex justify-between items-center sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-xl z-20">
            <div className="min-w-0">
              <h2 className="text-lg md:text-2xl font-bold tracking-tight truncate">{card.printed_name || card.name}</h2>
              <p className="text-white/40 text-[10px] md:text-sm font-mono truncate">{card.type_line}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 md:p-3 hover:bg-white/5 rounded-full transition-colors shrink-0"
            >
              <X size={20} md:size={24} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 sticky top-[69px] md:top-[81px] bg-[#0a0a0a]/80 backdrop-blur-xl z-20">
            <button
              onClick={() => setActiveTab('details')}
              className={cn(
                "flex-1 py-3 md:py-4 text-[10px] md:text-sm font-black uppercase tracking-[0.2em] transition-all border-b-2",
                activeTab === 'details' ? "border-white text-white bg-white/5" : "border-transparent text-white/20 hover:text-white/40"
              )}
            >
              Detalhes
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={cn(
                "flex-1 py-3 md:py-4 text-[10px] md:text-sm font-black uppercase tracking-[0.2em] transition-all border-b-2",
                activeTab === 'rules' ? "border-white text-white bg-white/5" : "border-transparent text-white/20 hover:text-white/40"
              )}
            >
              Regras <span className={cn("ml-1 px-1.5 py-0.5 rounded-md text-[10px]", activeTab === 'rules' ? "bg-white text-black" : "bg-white/10 text-white/40")}>{rules.length}</span>
            </button>
          </div>

          <div className="p-5 md:p-6 space-y-6 md:space-y-8 pb-32 md:pb-6">
            {activeTab === 'details' ? (
              <>
                {/* Oracle Text Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-black">Texto Oracle</h3>
                    {!translatedText && (
                      <button
                        onClick={handleTranslate}
                        disabled={loadingTranslation}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full transition-all disabled:opacity-50 border border-white/5"
                      >
                        {loadingTranslation ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                        Traduzir
                      </button>
                    )}
                  </div>
                  
                  <div className="p-5 bg-white/[0.02] rounded-2xl border border-white/5 text-sm md:text-base leading-relaxed whitespace-pre-wrap font-serif">
                    {getOracleText()}
                  </div>

                  {translatedText && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-black flex items-center gap-2">
                        <Languages size={12} /> Tradução PT-BR
                      </h3>
                      <div className="p-5 bg-white/5 rounded-2xl border border-white/10 text-sm md:text-base leading-relaxed whitespace-pre-wrap italic font-serif text-white/90">
                        {translatedText}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Legality Section */}
                <div className="space-y-4">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-black">Formatos & Legalidade</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {card.legalities ? mainFormats.map((format) => {
                      const status = (card.legalities as any)[format.id];
                      const { label, color } = formatLegality(status);
                      return (
                        <div key={format.id} className={cn("px-3 py-2 rounded-lg border text-[10px] font-bold flex justify-between items-center", color)}>
                          <span className="opacity-60">{format.name}</span>
                          <span>{label}</span>
                        </div>
                      );
                    }) : (
                      <div className="col-span-full p-4 bg-white/5 rounded-xl border border-white/10 text-center text-xs text-white/40">
                        Informações de legalidade indisponíveis para esta versão.
                      </div>
                    )}
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1 font-black">Raridade</p>
                    <p className="text-sm font-bold capitalize">{card.rarity}</p>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1 font-black">Coleção</p>
                    <p className="text-sm font-bold truncate">{card.set_name}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {loadingRules ? (
                  <div className="flex flex-col items-center justify-center py-12 text-white/20">
                    <Loader2 className="animate-spin mb-4" size={32} />
                    <p className="text-xs uppercase tracking-widest font-bold">Consultando Juiz...</p>
                  </div>
                ) : rules.length === 0 ? (
                  <div className="text-center py-12 text-white/20 bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
                    <Info className="mx-auto mb-3" size={32} />
                    <p className="text-sm font-medium">Nenhuma regra específica encontrada para esta carta.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-black">Regras Oficiais (Rulings)</h3>
                      {translatedRules.length === 0 && (
                        <button
                          onClick={handleTranslate}
                          disabled={loadingTranslation}
                          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full transition-all disabled:opacity-50 border border-white/5"
                        >
                          {loadingTranslation ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                          Traduzir Regras
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      {rules.map((rule, idx) => (
                        <div key={idx} className="space-y-3">
                          <div className="p-5 bg-white/[0.02] rounded-2xl border border-white/5 text-xs md:text-sm leading-relaxed">
                            <p className="text-white/20 mb-3 font-mono text-[10px]">{rule.published_at}</p>
                            <p className="text-white/80">{rule.comment}</p>
                          </div>
                          {translatedRules[idx] && (
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="p-5 bg-white/5 rounded-2xl border border-white/10 text-xs md:text-sm leading-relaxed italic text-white/90 font-serif"
                            >
                              {translatedRules[idx]}
                            </motion.div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="p-6 border-t border-white/5 bg-black/40 backdrop-blur-md sticky bottom-0">
            <a
              href={card.scryfall_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-4 bg-white text-black font-black rounded-2xl hover:bg-white/90 transition-all active:scale-[0.98] text-xs uppercase tracking-[0.2em]"
            >
              Ver no Scryfall <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
