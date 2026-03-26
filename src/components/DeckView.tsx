import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Trash2, Plus, Minus, Info, BarChart3, PieChart, LayoutGrid, Layers, AlertTriangle, CheckCircle2, Languages, ExternalLink, Copy, Check, Sparkles, FileUp, X, Loader2, BrainCircuit } from 'lucide-react';
import { db, DeckCard } from '../lib/db';
import { deckService } from '../lib/deckService';
import { analyzeDeckStrategy } from '../lib/gemini';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '../lib/utils';

interface DeckViewProps {
  deckId: number;
  onBack: () => void;
  onSelectCard: (scryfallId: string) => void;
}

export const DeckView: React.FC<DeckViewProps> = ({ deckId, onBack, onSelectCard }) => {
  const [activeTab, setActiveTab] = useState<'cards' | 'stats'>('cards');
  const [showValidation, setShowValidation] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const deck = useLiveQuery(() => db.decks.get(deckId));
  const cards = useLiveQuery(() => db.deckCards.where('deckId').equals(deckId).toArray());
  const validation = useLiveQuery(() => deckService.validateDeck(deckId), [deckId, cards]);
  const stats = useLiveQuery(() => deckService.getDeckStats(deckId), [deckId, cards]);

  const handleCopyList = async () => {
    try {
      const list = await deckService.exportDeckList(deckId);
      await navigator.clipboard.writeText(list);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy deck list:', err);
    }
  };

  const mainboard = useMemo(() => cards?.filter(c => !c.isSideboard && !c.isCommander) || [], [cards]);
  const sideboard = useMemo(() => cards?.filter(c => c.isSideboard) || [], [cards]);
  const commanders = useMemo(() => cards?.filter(c => c.isCommander) || [], [cards]);

  const categories = useMemo(() => {
    const creatures = mainboard.filter(c => c.typeLine.includes('Creature'));
    const planeswalkers = mainboard.filter(c => c.typeLine.includes('Planeswalker') || c.typeLine.includes('Battle'));
    const artifactsEnchantments = mainboard.filter(c => !c.typeLine.includes('Creature') && (c.typeLine.includes('Artifact') || c.typeLine.includes('Enchantment')));
    const instantsSorceries = mainboard.filter(c => c.typeLine.includes('Instant') || c.typeLine.includes('Sorcery'));
    const lands = mainboard.filter(c => c.typeLine.includes('Land'));
    const others = mainboard.filter(c => !c.typeLine.includes('Creature') && !c.typeLine.includes('Planeswalker') && !c.typeLine.includes('Battle') && !c.typeLine.includes('Artifact') && !c.typeLine.includes('Enchantment') && !c.typeLine.includes('Instant') && !c.typeLine.includes('Sorcery') && !c.typeLine.includes('Land'));

    return [
      { title: 'Criaturas', data: creatures },
      { title: 'Mágicas Instantâneas & Feitiços', data: instantsSorceries },
      { title: 'Artefatos & Encantamentos', data: artifactsEnchantments },
      { title: 'Planeswalkers & Batalhas', data: planeswalkers },
      { title: 'Terrenos', data: lands },
      { title: 'Outros', data: others }
    ].filter(cat => cat.data.length > 0);
  }, [mainboard]);

  const handleAnalyzeStrategy = async () => {
    setIsAnalyzing(true);
    try {
      const list = await deckService.exportDeckList(deckId);
      const cmdName = commanders.map(c => c.name).join(' e ');
      const result = await analyzeDeckStrategy(list, cmdName);
      setStrategy(result);
    } catch (err) {
      console.error("Failed to analyze deck:", err);
      setStrategy("Falha ao se comunicar com a Inteligência Artificial.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleQuantityChange = async (cardId: number, delta: number) => {
    const card = cards?.find(c => c.id === cardId);
    if (card) {
      try {
        await deckService.updateCardQuantity(cardId, card.quantity + delta);
      } catch (error) {
        console.error("Error updating card quantity:", error);
      }
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const handleDeleteCard = async (cardId: number) => {
    try {
      if (deleteConfirmId === cardId) {
        await deckService.removeCardFromDeck(cardId);
        setDeleteConfirmId(null);
      } else {
        setDeleteConfirmId(cardId);
        // Reset after 3 seconds
        setTimeout(() => setDeleteConfirmId(null), 3000);
      }
    } catch (error) {
      console.error("Error deleting card:", error);
    }
  };

  const handleToggleCommander = async (cardId: number) => {
    try {
      await deckService.toggleCommander(cardId);
    } catch (error) {
      console.error("Error toggling commander:", error);
    }
  };

  if (!deck) return null;

  return (
    <div className="space-y-8 pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest"
          >
            <ArrowLeft size={16} /> Voltar para Decks
          </button>
          <div>
            <h2 className="text-4xl md:text-6xl font-display font-bold tracking-tighter leading-none">{deck.name}</h2>
            <div className="flex items-center gap-4 mt-4">
              <span className="px-3 py-1 bg-purple-600/20 text-purple-400 border border-purple-500/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                {deck.format}
              </span>
              <span className="text-white/20 text-xs font-mono flex items-center gap-2">
                <Layers size={14} /> {validation?.counts.main || 0} / {deck.format === 'commander' ? '100' : '60+'} Cartas
              </span>
              {validation && (
                <button
                  onClick={() => setShowValidation(!showValidation)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                    validation.isValid 
                      ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  )}
                >
                  {validation.isValid ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {validation.isValid ? "Válido" : "Erros de Regra"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 p-1 bg-white/5 rounded-2xl w-full md:w-fit">
          <button
            onClick={handleCopyList}
            className={cn(
              "flex-1 md:flex-none justify-center px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 min-w-[130px]",
              copied ? "bg-green-500 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
            )}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copiado!" : "Copiar Lista"}
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex-1 md:flex-none justify-center px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 text-white/40 hover:text-white hover:bg-white/5 min-w-[130px]"
          >
            <FileUp size={14} /> Importar Lista
          </button>
          <div className="hidden md:block w-px h-4 bg-white/10 mx-1"></div>
          <button
            onClick={() => setActiveTab('cards')}
            className={cn(
              "flex-1 md:flex-none justify-center px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 min-w-[130px]",
              activeTab === 'cards' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
            )}
          >
            <LayoutGrid size={14} /> Cartas
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={cn(
              "flex-1 md:flex-none justify-center px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 min-w-[130px]",
              activeTab === 'stats' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
            )}
          >
            <BarChart3 size={14} /> Estatísticas
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showValidation && validation && !validation.isValid && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-[32px] space-y-4">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle size={20} />
                <h4 className="font-bold text-sm uppercase tracking-widest">Problemas de Validação</h4>
              </div>
              <ul className="space-y-2">
                {validation.errors.map((err, i) => (
                  <li key={i} className="text-sm text-red-200/60 flex items-center gap-2">
                    <div className="w-1 h-1 bg-red-400 rounded-full"></div> {err}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === 'cards' ? (
        <div className="space-y-12">
          {/* Commanders */}
          {deck.format === 'commander' && (
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-purple-400">Comandante ({commanders.length})</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {commanders.map((card) => (
                  <CardItem 
                    key={card.id} 
                    card={card} 
                    onQuantityChange={handleQuantityChange}
                    onDelete={handleDeleteCard}
                    onSelect={onSelectCard}
                    onToggleCommander={handleToggleCommander}
                    deleteConfirmId={deleteConfirmId}
                    isCommanderFormat={deck.format === 'commander'}
                  />
                ))}
                {commanders.length === 0 && (
                  <div className="col-span-full py-12 text-center border border-dashed border-white/5 rounded-[32px] bg-white/[0.02]">
                    <p className="text-xs text-white/20 uppercase tracking-widest font-bold">Nenhum comandante definido</p>
                    <p className="text-[10px] text-white/10 mt-2">Clique no ícone de estrela em uma carta para defini-la como comandante</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Categorized Mainboard */}
          {categories.map((category, idx) => {
            const sumCount = category.data.reduce((sum, c) => sum + c.quantity, 0);
            return (
              <section key={idx} className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-white/20">
                    {category.title} ({sumCount})
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {category.data.map((card) => (
                    <CardItem 
                      key={card.id} 
                      card={card} 
                      onQuantityChange={handleQuantityChange}
                      onDelete={handleDeleteCard}
                      onSelect={onSelectCard}
                      onToggleCommander={handleToggleCommander}
                      deleteConfirmId={deleteConfirmId}
                      isCommanderFormat={deck.format === 'commander'}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Sideboard */}
          {sideboard.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-white/20">Sideboard ({validation?.counts.side || 0})</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {sideboard.map((card) => (
                  <CardItem 
                    key={card.id} 
                    card={card} 
                    onQuantityChange={handleQuantityChange}
                    onDelete={handleDeleteCard}
                    onSelect={onSelectCard}
                    deleteConfirmId={deleteConfirmId}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* AI Strategy Generator */}
          <div className="p-8 bg-gradient-to-br from-purple-900/40 via-[#0a0a0a] to-[#0a0a0a] border border-purple-500/20 rounded-[40px] space-y-6 lg:col-span-2 shadow-2xl shadow-purple-900/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 blur-[100px] rounded-full pointer-events-none"></div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <BrainCircuit size={24} className="text-purple-400" />
                  <h3 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-purple-200 bg-clip-text text-transparent">Mentoria Estratégica (IA)</h3>
                </div>
                <p className="text-xs text-purple-200/50 uppercase tracking-widest font-bold ml-9">Gemini AI Analysis</p>
              </div>
              <button
                onClick={handleAnalyzeStrategy}
                disabled={isAnalyzing}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50 flex items-center gap-2 justify-center"
              >
                {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isAnalyzing ? "Analisando Deck..." : "Gerar Estratégia do Deck"}
              </button>
            </div>

            <AnimatePresence>
              {strategy && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-6 bg-black/40 border border-purple-500/10 rounded-3xl backdrop-blur-sm"
                >
                  <div className="prose prose-invert prose-purple max-w-none prose-sm sm:prose-base 
                                prose-headings:font-display prose-headings:font-bold prose-headings:tracking-tight
                                prose-p:text-white/70 prose-strong:text-purple-300 prose-ul:text-white/70 text-sm whitespace-pre-wrap leading-relaxed">
                    {strategy.split('\n').map((line, i) => {
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return <h4 key={i} className="text-purple-400 text-lg mt-4 mb-2">{line.replace(/\*\*/g, '')}</h4>;
                      }
                      if (line.startsWith('#')) {
                        return <h3 key={i} className="text-xl font-bold text-white mt-6 mb-3 border-b border-white/10 pb-2">{line.replace(/#/g, '').trim()}</h3>;
                      }
                      // Basic bold parsing within lines
                      let renderLine = line;
                      const boldParts = line.split(/(\*\*.*?\*\*)/g);
                      return (
                        <p key={i} className="mb-2">
                          {boldParts.map((part, j) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return <strong key={j} className="text-purple-300 font-bold">{part.replace(/\*\*/g, '')}</strong>;
                            }
                            return part;
                          })}
                        </p>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mana Curve */}
          <div className="p-8 bg-white/[0.03] border border-white/5 rounded-[40px] space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BarChart3 size={20} className="text-purple-400" />
                <h3 className="text-xl font-bold">Curva de Mana</h3>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-white/40 bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                Avg CMC: <span className="text-purple-400">{stats?.avgCmc}</span>
              </div>
            </div>
            <div className="flex items-end gap-2 h-48">
              {Object.entries(stats?.manaCurve || {}).map(([cmc, count]) => {
                const max = Math.max(...Object.values(stats?.manaCurve || {}));
                const height = (count / max) * 100;
                return (
                  <div key={cmc} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full relative">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        className="w-full bg-purple-600/40 group-hover:bg-purple-500 transition-all rounded-t-lg border-x border-t border-purple-500/20"
                      ></motion.div>
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold">
                        {count}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-white/20">{cmc}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Colors */}
          <div className="p-8 bg-white/[0.03] border border-white/5 rounded-[40px] space-y-8">
            <div className="flex items-center gap-3">
              <PieChart size={20} className="text-purple-400" />
              <h3 className="text-xl font-bold">Distribuição de Cores</h3>
            </div>
            <div className="space-y-4">
              {Object.entries(stats?.colors || {}).map(([color, count]) => {
                const total = Object.values(stats?.colors || {}).reduce((a, b) => a + b, 0);
                const percent = (count / total) * 100;
                const colorMap: Record<string, string> = {
                  'W': 'bg-yellow-100',
                  'U': 'bg-blue-500',
                  'B': 'bg-gray-800',
                  'R': 'bg-red-500',
                  'G': 'bg-green-500'
                };
                return (
                  <div key={color} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                      <span className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", colorMap[color])}></div> {color}
                      </span>
                      <span className="text-white/40">{count} ({percent.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        className={cn("h-full", colorMap[color])}
                      ></motion.div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Types */}
          <div className="p-8 bg-white/[0.03] border border-white/5 rounded-[40px] space-y-8 lg:col-span-2">
            <div className="flex items-center gap-3">
              <PieChart size={20} className="text-purple-400" />
              <h3 className="text-xl font-bold">Distribuição de Tipos</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(stats?.types || {})
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => {
                  const total = cards?.reduce((sum, c) => sum + c.quantity, 0) || 1;
                  const percent = (count / total) * 100;
                  return (
                    <div key={type} className="space-y-2 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-purple-400">{type}</span>
                        <span className="text-white/40">{count}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(percent, 100)}%` }}
                          className="h-full bg-purple-500"
                        ></motion.div>
                      </div>
                      <div className="text-[10px] text-white/20 font-mono text-right">
                        {percent.toFixed(1)}% do deck
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <AnimatePresence>
        {showImport && (
          <ImportModal 
            deckId={deckId} 
            onClose={() => setShowImport(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const ImportModal: React.FC<{ deckId: number; onClose: () => void }> = ({ deckId, onClose }) => {
  const [text, setText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ added: string[], notFound: string[] } | null>(null);

  const handleImport = async () => {
    if (!text.trim()) return;
    setIsImporting(true);
    try {
      const res = await deckService.importDeckList(deckId, text);
      setResult(res);
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setIsImporting(false);
    }
  };

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
        className="bg-[#0a0a0a] border border-white/10 rounded-[40px] w-full max-w-2xl overflow-hidden shadow-2xl"
      >
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold">Importar Lista de Deck</h3>
            <p className="text-xs text-white/40 font-medium uppercase tracking-widest">Cole sua lista abaixo (ex: 4 Lightning Bolt)</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {!result ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="1 Sol Ring&#10;1 Arcane Signet&#10;Sideboard&#10;1 Lightning Bolt"
                className="w-full h-64 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-mono focus:outline-none focus:border-purple-500 transition-colors resize-none"
              />
              <div className="flex justify-end gap-4">
                <button
                  onClick={onClose}
                  className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={isImporting || !text.trim()}
                  className="px-8 py-3 bg-white text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-purple-400 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isImporting ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                  {isImporting ? "Importando..." : "Começar Importação"}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-green-400 flex items-center gap-2">
                    <CheckCircle2 size={14} /> Adicionadas ({result.added.length})
                  </h4>
                  <div className="bg-green-500/5 border border-green-500/10 rounded-2xl p-4 h-48 overflow-y-auto space-y-1">
                    {result.added.map((name, i) => (
                      <div key={i} className="text-[10px] text-green-200/60 font-mono">{name}</div>
                    ))}
                    {result.added.length === 0 && <div className="text-[10px] text-white/10 italic">Nenhuma carta adicionada</div>}
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
                    <AlertTriangle size={14} /> Não Encontradas ({result.notFound.length})
                  </h4>
                  <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4 h-48 overflow-y-auto space-y-1">
                    {result.notFound.map((name, i) => (
                      <div key={i} className="text-[10px] text-red-200/60 font-mono">{name}</div>
                    ))}
                    {result.notFound.length === 0 && <div className="text-[10px] text-white/10 italic">Todas as cartas encontradas</div>}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-4 bg-white text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-purple-400 hover:text-white transition-all"
              >
                Concluído
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const CardItem: React.FC<{
  card: DeckCard;
  onQuantityChange: (id: number, delta: number) => void;
  onDelete: (id: number) => void;
  onSelect: (id: string) => void;
  onToggleCommander?: (id: number) => void;
  deleteConfirmId: number | null;
  isCommanderFormat?: boolean;
}> = ({ card, onQuantityChange, onDelete, onSelect, onToggleCommander, deleteConfirmId, isCommanderFormat }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative space-y-3"
    >
      <div 
        onClick={() => onSelect(card.scryfallId)}
        className={cn(
          "relative aspect-[63/88] rounded-[4.75% / 3.5%] overflow-hidden border transition-all cursor-pointer shadow-xl",
          card.isCommander ? "border-purple-500 shadow-purple-500/20" : "border-white/5 group-hover:border-purple-500/50"
        )}
      >
        <img
          src={card.imageUri}
          alt={card.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          referrerPolicy="no-referrer"
        />
        
        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
          <div className="flex items-center gap-2 text-[10px] text-purple-400 font-bold uppercase tracking-widest">
            <Languages size={12} /> Tradução Salva
          </div>
        </div>

        {card.isCommander && (
          <div className="absolute inset-0 border-4 border-purple-500/30 pointer-events-none"></div>
        )}
        
        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {card.isCommander && (
            <div className="px-2 py-1 bg-purple-600 text-white border border-purple-400/50 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg">
              Comandante
            </div>
          )}
        </div>

        <div className="absolute top-2 right-2 px-2 py-1 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg text-xs font-bold shadow-2xl">
          x{card.quantity}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-bold truncate group-hover:text-purple-400 transition-colors flex-1">{card.translatedName || card.name}</h4>
          <span className="text-[10px] font-mono text-white/40 mt-0.5 shrink-0">{card.manaCost}</span>
        </div>
        <p className="text-[10px] text-white/20 truncate uppercase tracking-widest">{card.typeLine}</p>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center p-1 bg-white/5 rounded-xl border border-white/5">
            <button
              onClick={() => card.id && onQuantityChange(card.id, -1)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Minus size={12} />
            </button>
            <span className="px-3 text-xs font-bold font-mono">{card.quantity}</span>
            <button
              onClick={() => card.id && onQuantityChange(card.id, 1)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Plus size={12} />
            </button>
          </div>
          
          <div className="flex items-center gap-1">
            {isCommanderFormat && onToggleCommander && (
              <button
                onClick={() => card.id && onToggleCommander(card.id)}
                className={cn(
                  "p-2 rounded-xl transition-all",
                  card.isCommander 
                    ? "bg-purple-600 text-white" 
                    : "text-white/10 hover:text-purple-400 hover:bg-purple-400/10"
                )}
                title={card.isCommander ? "Remover Comandante" : "Definir como Comandante"}
              >
                <Sparkles size={14} />
              </button>
            )}
            <button
              onClick={() => card.id && onDelete(card.id)}
              className={cn(
                "p-2 transition-all rounded-xl",
                deleteConfirmId === card.id 
                  ? "bg-red-500 text-white scale-110" 
                  : "text-white/10 hover:text-red-400"
              )}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
