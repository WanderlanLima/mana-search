import React, { useState, useEffect } from 'react';
import { Ghost, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const NightmareStatus: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [keywordCount, setKeywordCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/keywords');
        if (response.ok) {
          const data = await response.json();
          const count = Object.keys(data.keywords || {}).length;
          setKeywordCount(count);
          
          // If count is increasing, it's likely running
          // (This is a simple heuristic since we don't have a real status API)
        }
      } catch (error) {
        console.error("NightmareStatus: Error fetching status", error);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button 
        onClick={() => setIsVisible(!isVisible)}
        className="bg-black/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-2xl hover:bg-black/90 transition-all group"
      >
        <Ghost size={20} className={status === 'running' ? "text-purple-400 animate-pulse" : "text-white/60 group-hover:text-white"} />
      </button>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute bottom-16 right-0 w-64 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3 border-bottom border-white/5 pb-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Ghost size={18} className="text-purple-400" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-white">NIGHTMARE</h4>
                <p className="text-[10px] text-white/40 font-bold uppercase">Keyword Robot</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                <span className="text-white/40">Status</span>
                <span className="flex items-center gap-1.5 text-green-400">
                  <CheckCircle2 size={10} /> Ativo
                </span>
              </div>
              
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                <span className="text-white/40">Keywords</span>
                <span className="text-white">{keywordCount}</span>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <p className="text-[10px] text-white/60 leading-relaxed italic">
                  O robô Nightmare está varrendo o Scryfall em busca de novas keywords e definições oficiais.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
