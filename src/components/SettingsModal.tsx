import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Key, Save, Trash2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { storage } from '../lib/storage';
import { cn } from '../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (isOpen) {
      setApiKey(storage.getGeminiKey() || '');
      setStatus('idle');
    }
  }, [isOpen]);

  const handleSave = () => {
    if (apiKey.trim()) {
      storage.setGeminiKey(apiKey);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } else {
      setStatus('error');
    }
  };

  const handleClear = () => {
    storage.clearGeminiKey();
    setApiKey('');
    setStatus('error'); // Usar o estado de erro/alerta para mostrar que foi limpo
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-md glass-surface rounded-[40px] p-8 border border-white/10 shadow-2xl relative z-[210] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/20 blur-[80px] rounded-full" />
            
            <div className="flex items-center justify-between mb-8 relative">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-600/20 rounded-2xl flex items-center justify-center">
                  <Key size={24} className="text-purple-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-display font-bold tracking-tight">Configurações</h2>
                  <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Personalize sua experiência</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <X size={24} className="text-white/40" />
              </button>
            </div>

            <div className="space-y-6 relative">
              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-black flex items-center gap-2">
                  Gemini API Key
                  <div className="group relative">
                    <Info size={12} className="cursor-help" />
                    <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-black border border-white/10 rounded-xl text-[10px] leading-relaxed normal-case tracking-normal font-normal opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl">
                      Sua chave é salva apenas localmente no seu dispositivo. Ela será usada para traduções de alta qualidade das cartas e regras.
                    </div>
                  </div>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Cole sua chave aqui..."
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-purple-500/50 transition-all font-mono"
                  />
                  {status === 'saved' && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-400 flex items-center gap-2">
                      <CheckCircle2 size={18} />
                    </div>
                  )}
                </div>
                
                <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl flex items-start gap-3">
                  <Info size={16} className="text-purple-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    <strong className="text-purple-400">Privacidade Total:</strong> Sua chave de API é salva <span className="text-white font-bold underline decoration-purple-500/50">exclusivamente</span> no seu dispositivo (localStorage). Ela nunca é enviada para nossos servidores.
                  </p>
                </div>

                <p className="text-[10px] text-white/20 leading-relaxed italic">
                  * Se a chave falhar ou acabar os tokens, o app usará o Google Tradutor automaticamente.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSave}
                  className="flex-1 bg-white text-black h-14 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-purple-400 transition-all active:scale-95"
                >
                  <Save size={20} />
                  Salvar Chave
                </button>
                <button
                  onClick={handleClear}
                  className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all border border-white/5"
                  title="Limpar Chave"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              {status === 'error' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-xs"
                >
                  <AlertCircle size={16} />
                  {apiKey === '' ? "Chave removida com sucesso." : "Por favor, insira uma chave válida."}
                </motion.div>
              )}
            </div>

            <div className="mt-8 pt-8 border-t border-white/5 text-center">
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] uppercase tracking-widest text-purple-400 hover:text-purple-300 font-bold transition-colors"
              >
                Obter minha chave gratuita no AI Studio
              </a>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
