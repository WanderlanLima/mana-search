import React, { useState, useEffect } from 'react';
import { Ghost, Loader2, CheckCircle2, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { keywordService } from '../lib/keywordService';

interface NightmareStatusProps {
  isOpen: boolean;
  onClose: () => void;
  onSearchKeywords: () => void;
}

export const NightmareStatus: React.FC<NightmareStatusProps> = ({ isOpen, onClose, onSearchKeywords }) => {
  const [keywordCount, setKeywordCount] = useState(0);
  const [keywords, setKeywords] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const checkStatus = async () => {
      await keywordService.initialize();
      setKeywordCount(keywordService.getKeywordCount());
      setKeywords(Object.keys(keywordService.getAllDefinitions()));
    };

    checkStatus();
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full max-w-md bg-[#121212] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
              <div className="p-3 bg-purple-500/20 rounded-2xl">
                <Ghost size={24} className="text-purple-400" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-white">NIGHTMARE STATUS</h4>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Mecanismo de Catalogação Automática</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Status</span>
                  <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
                    <CheckCircle2 size={14} /> Ativo
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Keywords</span>
                  <div className="text-white font-bold text-sm">
                    {keywordCount} catalogadas
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-xs text-white/60 leading-relaxed italic">
                  O robô Nightmare está varrendo o Scryfall em busca de novas keywords e definições oficiais traduzidas via Gemini AI.
                </p>
              </div>

              <button
                onClick={() => {
                  onSearchKeywords();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-3 p-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-bold transition-all active:scale-95 group"
              >
                <Search size={18} className="group-hover:scale-110 transition-transform" />
                <span>PESQUISAR APENAS KEYWORDS</span>
              </button>
            </div>

            <div className="pt-4 border-t border-white/5">
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                {keywords.slice(0, 20).map(kw => (
                  <span key={kw} className="px-2 py-1 bg-white/5 rounded text-[10px] text-white/40 uppercase font-bold">
                    {kw}
                  </span>
                ))}
                {keywords.length > 20 && (
                  <span className="px-2 py-1 text-[10px] text-white/20 font-bold">
                    +{keywords.length - 20} mais...
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
