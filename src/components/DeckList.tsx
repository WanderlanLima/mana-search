import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Calendar, Book, ChevronRight, LayoutGrid, Info, Copy, RefreshCw, Database, CloudDownload, CheckCircle2, AlertTriangle, Loader2, X } from 'lucide-react';
import { db, MTGFormat, Deck, SyncStatus } from '../lib/db';
import { deckService } from '../lib/deckService';
import { bulkDataService } from '../lib/bulkDataService';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '../lib/utils';

interface DeckWithCount extends Deck {
  cardCount: number;
}

interface DeckListProps {
  onSelectDeck: (deckId: number) => void;
}

export const DeckList: React.FC<DeckListProps> = ({ onSelectDeck }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<MTGFormat>('none');

  const syncStatus = useLiveQuery(() => db.syncStatus.get('oracle_cards'));

  const decks = useLiveQuery(async () => {
    const allDecks = await db.decks.orderBy('updatedAt').reverse().toArray();
    const decksWithCounts = await Promise.all(
      allDecks.map(async (deck) => {
        const cards = await db.deckCards.where('deckId').equals(deck.id!).toArray();
        const total = cards.reduce((sum, c) => sum + c.quantity, 0);
        return { ...deck, cardCount: total };
      })
    );
    return decksWithCounts;
  }, []);

  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;

    try {
      await deckService.createDeck(newDeckName, newDeckFormat);
      setNewDeckName('');
      setNewDeckFormat('none');
      setIsCreating(false);
    } catch (error) {
      console.error("Error creating deck:", error);
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const handleDeleteDeck = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      if (deleteConfirmId === id) {
        await deckService.deleteDeck(id);
        setDeleteConfirmId(null);
      } else {
        setDeleteConfirmId(id);
        // Reset after 3 seconds
        setTimeout(() => setDeleteConfirmId(null), 3000);
      }
    } catch (error) {
      console.error("Error deleting deck:", error);
    }
  };

  const handleDuplicateDeck = async (e: React.MouseEvent, deck: DeckWithCount) => {
    e.stopPropagation();
    try {
      const newName = `${deck.name} (Cópia)`;
      const newDeckId = await deckService.createDeck(newName, deck.format);
      
      // Copy all cards
      const cards = await db.deckCards.where('deckId').equals(deck.id!).toArray();
      for (const card of cards) {
        const { id, deckId, ...cardData } = card;
        await db.deckCards.add({
          ...cardData,
          deckId: newDeckId
        });
      }
    } catch (error) {
      console.error("Error duplicating deck:", error);
    }
  };

  const formats: { id: MTGFormat; name: string }[] = [
    { id: 'none', name: 'Sem Formato' },
    { id: 'standard', name: 'Standard' },
    { id: 'pioneer', name: 'Pioneer' },
    { id: 'modern', name: 'Modern' },
    { id: 'legacy', name: 'Legacy' },
    { id: 'vintage', name: 'Vintage' },
    { id: 'commander', name: 'Commander' },
    { id: 'pauper', name: 'Pauper' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold tracking-tight">Meus Decks</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-white/40 text-sm font-mono uppercase tracking-widest">Deck Vault & Offline Storage</p>
            {syncStatus?.status === 'idle' && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-md text-[8px] font-black uppercase tracking-widest">
                <Database size={10} /> {syncStatus.totalCards.toLocaleString()} Cartas Offline
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSync(true)}
            className="flex items-center gap-2 px-4 py-3 bg-white/5 text-white/60 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all active:scale-95 border border-white/10"
          >
            <RefreshCw size={16} className={cn(syncStatus?.status === 'syncing' && "animate-spin")} /> 
            {syncStatus?.status === 'syncing' ? "Sincronizando..." : "Sincronizar"}
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-purple-500 hover:text-white transition-all active:scale-95 shadow-lg shadow-white/5"
          >
            <Plus size={16} /> Novo Deck
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSync && (
          <SyncModal onClose={() => setShowSync(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-6 bg-white/5 border border-white/10 rounded-[32px] space-y-6"
          >
            <form onSubmit={handleCreateDeck} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-black text-white/20 ml-2">Nome do Deck</label>
                  <input
                    autoFocus
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="Ex: Meu Commander de Yuriko"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/10 focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-black text-white/20 ml-2">Formato</label>
                  <select
                    value={newDeckFormat}
                    onChange={(e) => setNewDeckFormat(e.target.value as MTGFormat)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-purple-500/50 transition-colors appearance-none"
                  >
                    {formats.map(f => (
                      <option key={f.id} value={f.id} className="bg-[#1a1a1a]">{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 bg-purple-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-purple-500 transition-all shadow-lg shadow-purple-600/20"
                >
                  Criar Deck
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {decks?.map((deck) => (
          <motion.div
            key={deck.id}
            layoutId={`deck-${deck.id}`}
            onClick={() => deck.id && onSelectDeck(deck.id)}
            className="group relative bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 rounded-[32px] p-8 transition-all cursor-pointer overflow-hidden"
          >
            {/* Background Accent */}
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-purple-600/10 blur-3xl rounded-full group-hover:bg-purple-600/20 transition-all"></div>
            
            <div className="relative z-10 space-y-6">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-purple-600/20 group-hover:text-purple-400 transition-all">
                  <Book size={24} />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => deck.id && handleDuplicateDeck(e, deck)}
                    className="p-2 rounded-xl text-white/10 hover:text-purple-400 hover:bg-purple-400/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Duplicar Deck"
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    onClick={(e) => deck.id && handleDeleteDeck(e, deck.id)}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      deleteConfirmId === deck.id 
                        ? "bg-red-500 text-white scale-110" 
                        : "text-white/10 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-display font-bold tracking-tight group-hover:text-purple-300 transition-colors">{deck.name}</h3>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] uppercase tracking-widest font-black px-2 py-1 bg-white/5 rounded-md text-white/40 border border-white/5">
                    {deck.format}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest font-black px-2 py-1 bg-purple-500/10 rounded-md text-purple-400 border border-purple-500/10">
                    {deck.cardCount} Cards
                  </span>
                  <span className="text-[10px] text-white/20 flex items-center gap-1 font-mono">
                    <Calendar size={10} /> {new Date(deck.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/20">
                  <LayoutGrid size={14} />
                  <span className="text-xs font-bold">Ver Detalhes</span>
                </div>
                <ChevronRight size={16} className="text-white/20 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </motion.div>
        ))}

        {decks?.length === 0 && !isCreating && (
          <div className="col-span-full py-20 text-center space-y-6 bg-white/[0.02] border border-dashed border-white/10 rounded-[40px]">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto">
              <Info size={32} className="text-white/20" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">Nenhum deck encontrado</h3>
              <p className="text-white/40 text-sm max-w-xs mx-auto">Comece a construir sua coleção offline criando seu primeiro deck.</p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-all border border-white/10"
            >
              Criar Agora
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const SyncModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const syncStatus = useLiveQuery(() => db.syncStatus.get('oracle_cards'));

  const handleSync = async () => {
    try {
      await bulkDataService.syncCards((current, total) => {
        setProgress({ current, total });
      });
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const isSyncing = syncStatus?.status === 'syncing';
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[#0a0a0a] border border-white/10 rounded-[40px] w-full max-w-lg overflow-hidden shadow-2xl"
      >
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold">Base de Dados Offline</h3>
            <p className="text-xs text-white/40 font-medium uppercase tracking-widest">Sincronize todas as cartas do Scryfall</p>
          </div>
          <button onClick={onClose} disabled={isSyncing} className="p-2 hover:bg-white/5 rounded-full transition-colors disabled:opacity-20">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-purple-600/10 rounded-2xl flex items-center justify-center text-purple-400">
              <CloudDownload size={32} />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-bold">Por que sincronizar?</h4>
              <p className="text-xs text-white/40 leading-relaxed">
                Ao baixar a base de dados, a busca de cartas e a criação de decks serão instantâneas e funcionarão sem internet.
              </p>
            </div>
          </div>

          {syncStatus?.lastSync ? (
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Última Sincronização</span>
                <p className="text-xs font-mono">{new Date(syncStatus.lastSync).toLocaleString()}</p>
              </div>
              <div className="text-right space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Total de Cartas</span>
                <p className="text-xs font-mono">{syncStatus.totalCards.toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-purple-500/5 rounded-2xl border border-purple-500/10 text-center">
              <p className="text-xs text-purple-300/60 italic">Nenhuma sincronização realizada ainda.</p>
            </div>
          )}

          {isSyncing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="flex items-center gap-2 text-purple-400">
                  <Loader2 size={12} className="animate-spin" /> Processando Cartas...
                </span>
                <span className="text-white/40">{percent}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  className="h-full bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                ></motion.div>
              </div>
              <p className="text-[10px] text-white/20 text-center font-mono">
                {progress.current.toLocaleString()} / {progress.total.toLocaleString()}
              </p>
            </div>
          ) : (
            <button
              onClick={handleSync}
              className="w-full py-4 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-purple-500 hover:text-white transition-all shadow-lg active:scale-[0.98]"
            >
              {syncStatus?.lastSync ? "Atualizar Base de Dados" : "Baixar Base de Dados (~30MB)"}
            </button>
          )}

          {syncStatus?.status === 'error' && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400">
              <AlertTriangle size={16} />
              <p className="text-[10px] font-bold uppercase tracking-tight">Erro: {syncStatus.error}</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-white/[0.02] border-t border-white/5 text-center">
          <p className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-bold">Dados fornecidos por Scryfall API</p>
        </div>
      </motion.div>
    </motion.div>
  );
};
