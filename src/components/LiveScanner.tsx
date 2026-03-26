import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Scan, Loader2, CheckCircle2, AlertCircle, ScanLine } from 'lucide-react';
import { scryfall } from '../lib/scryfall';
import Tesseract from 'tesseract.js';

interface LiveScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (cardName: string) => void;
}

export const LiveScanner: React.FC<LiveScannerProps> = ({ isOpen, onClose, onDetected }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Tesseract.Worker | null>(null);
  const loopRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [scannedCards, setScannedCards] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setFeedback({ text: 'Iniciando Motor de Visão...', type: 'info' });
      initWorker();
      startCamera();
    } else {
      shutdown();
    }
    return () => shutdown();
  }, [isOpen]);

  const initWorker = async () => {
    try {
      if (!workerRef.current) {
        workerRef.current = await Tesseract.createWorker('eng');
        await workerRef.current.setParameters({
          tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',-"
        });
      }
      setIsEngineReady(true);
      setFeedback({ text: 'Aponte a mira para o TÍTULO da carta', type: 'info' });
    } catch (err) {
      console.error("Worker error:", err);
      setFeedback({ text: 'Erro ao iniciar OCR Offline', type: 'error' });
    }
  };

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: 'environment', // Triggers rear camera on phones
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
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
    setIsEngineReady(false);
    setScannedCards([]);
    setFeedback(null);
    isProcessingRef.current = false;
  };

  // The Continuous Scanning Loop
  useEffect(() => {
    if (isOpen && isEngineReady && stream) {
      loopRef.current = setInterval(processFrame, 1000); // Process 1 frame every second
    }
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, [isOpen, isEngineReady, stream]);

  const processFrame = async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current || isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Extract only the top title bar area to OCR
      // Let's assume the alignment reticle targets the upper 20% of the screen horizontally
      // Video might be 1280x720. The target is a wide rectangle in the middle-top.
      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (vW === 0 || vH === 0) {
        isProcessingRef.current = false;
        return;
      }

      // We slice a rectangle covering 80% of width and 15% of height, positioned at Y=20%
      const cropX = vW * 0.1;
      const cropY = vH * 0.2;
      const cropW = vW * 0.8;
      const cropH = vH * 0.2;

      canvas.width = cropW;
      canvas.height = cropH;

      // Draw and apply Anti-Moiré + High Contrast Threshold
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = 'grayscale(100%) blur(1.5px) contrast(350%) brightness(140%)';
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const base64 = canvas.toDataURL('image/png');

      // 1. Local Browser OCR Array
      const { data: { text } } = await workerRef.current.recognize(base64);
      const cleaned = text.split('\n').map(l => l.trim()).filter(l => l.length > 3)[0];
      
      if (cleaned) {
        // 2. Validate with Scryfall (Fuzzy or Autocomplete)
        let matchedName: string | null = null;
        try {
          const names = await scryfall.getAutocomplete(cleaned);
          if (names.length > 0) {
            matchedName = names[0];
          } else {
            const fuzzyRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cleaned)}`);
            if (fuzzyRes.ok) {
              const cardData = await fuzzyRes.json();
              matchedName = cardData.name;
            }
          }
        } catch (e) {
          // Ignore network errs on rapid loop
        }

        if (matchedName) {
          // SUCCESS!
          if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback like Native apps
          setFeedback({ text: `${matchedName} Detectado!`, type: 'success' });
          
          setScannedCards(prev => {
            if (!prev.includes(matchedName!)) {
              return [matchedName!, ...prev].slice(0, 5); // Keep last 5 history visible
            }
            return prev;
          });

          onDetected(matchedName); // Feed it forward to the parent 
          
          // Pause execution for 1.5 seconds to let user look at success before firing again
          await new Promise(r => setTimeout(r, 1500));
          setFeedback({ text: 'Aponte a mira para o TÍTULO da carta', type: 'info' });
        }
      }
    } catch (err) {
      console.warn("Frame drop:", err);
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
                <h3 className="text-lg font-display font-bold">Live Scanner</h3>
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Motor: Tesseract Local</p>
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
              className="w-full h-full object-cover"
            />
            
            {/* Dark Overlay with cutout for HUD */}
            <div className="absolute inset-0 pointer-events-none bg-black/40 flex flex-col">
              <div className="flex-[0.2]" />
              <div className="flex justify-center flex-[0.2]">
                {/* The "Reticle" that the user aligns the title with */}
                <div className="w-[80%] h-full border-2 border-purple-500/80 rounded-lg relative bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] flex items-center justify-center">
                  {/* Corners */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-purple-500 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-purple-500 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-purple-500 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-purple-500 rounded-br-lg" />
                  
                  {isProcessingRef.current && (
                    <div className="absolute bottom-0 left-0 h-0.5 bg-purple-500 animate-pulse w-full filter blur-sm"></div>
                  )}
                </div>
              </div>
              <div className="flex-[0.6] flex flex-col items-center justify-start pt-12">
                
                {/* Dynamic Feedback Center */}
                {feedback && (
                  <motion.div
                    key={feedback.text}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`px-6 py-3 rounded-full flex items-center gap-3 backdrop-blur-md border ${
                      feedback.type === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-300' :
                      feedback.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-300' :
                      'bg-white/10 border-white/20 text-white/80'
                    }`}
                  >
                    {feedback.type === 'success' && <CheckCircle2 size={18} />}
                    {feedback.type === 'error' && <AlertCircle size={18} />}
                    {!isEngineReady && feedback.type === 'info' && <Loader2 size={18} className="animate-spin" />}
                    <span className="text-sm font-bold uppercase tracking-wider">{feedback.text}</span>
                  </motion.div>
                )}

                {/* Scanned History List */}
                {scannedCards.length > 0 && (
                  <div className="mt-8 w-full max-w-xs space-y-2">
                    {scannedCards.map((card, i) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={`${card}-${i}`}
                        className={`px-4 py-3 rounded-xl border flex items-center justify-between ${
                          i === 0 
                            ? 'bg-purple-600/20 border-purple-500/50 text-white' 
                            : 'bg-white/5 border-white/5 text-white/40'
                        }`}
                      >
                        <span className="text-sm font-bold truncate">{card}</span>
                        {i === 0 && <span className="text-[10px] uppercase font-black tracking-widest text-purple-400">Novo</span>}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Hidden Canvas for OCR processing */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
