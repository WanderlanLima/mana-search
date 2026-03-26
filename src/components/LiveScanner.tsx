import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ScanLine, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { scryfall } from '../lib/scryfall';
import { identifyCardFromImage } from '../lib/gemini';

interface LiveScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (cardName: string) => void;
}

export const LiveScanner: React.FC<LiveScannerProps> = ({ isOpen, onClose, onDetected }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [scannedCards, setScannedCards] = useState<string[]>([]);
  const [visionMode] = useState<boolean>(true); // Motor AI Ativo

  useEffect(() => {
    if (isOpen) {
      setFeedback({ text: 'Iniciando A.I. Vision...', type: 'info' });
      startCamera();
    } else {
      shutdown();
    }
    return () => shutdown();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setFeedback({ text: 'Exiba a carta inteira na Câmera', type: 'info' });
    } catch (err) {
      console.error("Camera error:", err);
      setFeedback({ text: 'Permissão de câmera negada', type: 'error' });
    }
  };

  const shutdown = () => {
    if (loopRef.current) clearInterval(loopRef.current);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setScannedCards([]);
    setFeedback(null);
    isProcessingRef.current = false;
  };

  // Loop of vision processing. We use a slower interval (3s) to not burn the Gemini Free API limit (15 RPM)
  // while still giving a decent "Real-Time / Live" scan feel.
  useEffect(() => {
    if (isOpen && stream) {
      // Clear any previous interval
      if (loopRef.current) clearInterval(loopRef.current);
      
      // We will loop every 3.5 seconds
      loopRef.current = setInterval(processFrame, 3500); 
      // Call first tick manually a slightly faster
      setTimeout(processFrame, 1000);
    }
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, [isOpen, stream]);

  const processFrame = async () => {
    if (!videoRef.current || !canvasRef.current || isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (vW === 0 || vH === 0) {
        isProcessingRef.current = false;
        return;
      }

      // We downscale to 640xH to save API Bandwidth and speed up transmission to Gemini
      canvas.width = 640;
      canvas.height = (640 / vW) * vH;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.8);

      // AI Vision API
      const resultName = await identifyCardFromImage(base64);

      if (resultName) {
        // Validate with scryfall just to be absolutely sure the name is real
        let finalCardName: string | null = null;
        try {
          const names = await scryfall.getAutocomplete(resultName);
          if (names.length > 0) {
            finalCardName = names[0];
          } else {
            const fuzzyRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(resultName)}`);
            if (fuzzyRes.ok) {
              const cardData = await fuzzyRes.json();
              finalCardName = cardData.name;
            }
          }
        } catch (e) {
             finalCardName = resultName; // Trust Gemini if Scryfall fails
        }

        if (finalCardName) {
          if (navigator.vibrate) navigator.vibrate([50, 100, 50]); // Sucesso haptic!
          setFeedback({ text: `${finalCardName} Identificado!`, type: 'success' });
          
          setScannedCards(prev => {
            if (!prev.includes(finalCardName!)) {
              return [finalCardName!, ...prev].slice(0, 5); // Keep last 5 history visible
            }
            return prev;
          });

          onDetected(finalCardName);
          
          // Pausa extra para você ler o nome e trocar a carta fisicamente
          await new Promise(r => setTimeout(r, 2000));
          setFeedback({ text: 'Mande a próxima câmera inteira...', type: 'info' });
        }
      }
    } catch (err: any) {
      if (err?.message === "GEMINI_QUOTA_EXCEEDED") {
        setFeedback({ text: 'Limite API Alcançado. Segure a carta...', type: 'error' });
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] bg-black flex flex-col">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                <ScanLine size={20} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold">A.I. Vision</h3>
                <p className="text-[10px] uppercase tracking-widest text-purple-400 font-bold animate-pulse">Scanning Full Art</p>
              </div>
            </div>
            <button 
              onClick={handleClose}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden bg-[#0A0A0A]">
            <video 
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover filter contrast-125"
            />
            
            {/* Full Screen Scan Guides (Corner Brackets) */}
            <div className="absolute inset-4 pointer-events-none flex flex-col outline-none">
              <div className="flex-1 flex justify-between items-start">
                  <div className="w-12 h-12 border-t-4 border-l-4 border-purple-500/50 rounded-tl-3xl opacity-50" />
                  <div className="w-12 h-12 border-t-4 border-r-4 border-purple-500/50 rounded-tr-3xl opacity-50" />
              </div>
              <div className="flex-1 flex justify-between items-end">
                  <div className="w-12 h-12 border-b-4 border-l-4 border-purple-500/50 rounded-bl-3xl opacity-50" />
                  <div className="w-12 h-12 border-b-4 border-r-4 border-purple-500/50 rounded-br-3xl opacity-50" />
              </div>
            </div>

            {/* Scanning Radar Scanline Overlay */}
            {stream && (
              <motion.div 
                initial={{ top: '0%' }}
                animate={{ top: '100%' }}
                transition={{ duration: 3.5, ease: "linear", repeat: Infinity }}
                className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent shadow-[0_0_20px_5px_rgba(168,85,247,0.4)] z-10"
              />
            )}

            <div className="absolute inset-0 pointer-events-none flex flex-col justify-end pb-12 items-center z-20">
              {/* Dynamic Feedback Center */}
              <AnimatePresence mode="wait">
                {feedback && (
                  <motion.div
                    key={feedback.text}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`px-8 py-4 mb-4 rounded-full flex items-center gap-3 backdrop-blur-xl border shadow-2xl ${
                      feedback.type === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-300' :
                      feedback.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-300' :
                      'bg-purple-900/40 border-purple-500/40 text-purple-100'
                    }`}
                  >
                    {feedback.type === 'success' && <CheckCircle2 size={24} />}
                    {feedback.type === 'error' && <AlertCircle size={24} />}
                    {feedback.type === 'info' && <Loader2 size={24} className="animate-spin text-purple-400" />}
                    <span className="text-sm font-black uppercase tracking-widest">{feedback.text}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Scanned History List */}
              {scannedCards.length > 0 && (
                <div className="w-full max-w-sm space-y-2 px-6">
                  {scannedCards.map((card, i) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={`${card}-${i}`}
                      className={`px-6 py-4 rounded-2xl border backdrop-blur-md flex items-center justify-between shadow-lg ${
                        i === 0 
                          ? 'bg-purple-600/30 border-purple-500/80 text-white' 
                          : 'bg-black/60 border-white/5 text-white/40'
                      }`}
                    >
                      <span className="text-sm font-bold truncate flex-1">{card}</span>
                      {i === 0 && <span className="text-[10px] uppercase font-black tracking-widest px-3 py-1 bg-purple-500/20 rounded-lg text-purple-300 ml-2">Identificado</span>}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Hidden Canvas for Vision sampling */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
