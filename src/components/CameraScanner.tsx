import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Loader2, Sparkles, Scan, AlertCircle } from 'lucide-react';
import { identifyCardFromImage } from '../lib/gemini';
import { storage } from '../lib/storage';
import { cn } from '../lib/utils';
import { scryfall } from '../lib/scryfall';
import Tesseract from 'tesseract.js';

interface CameraScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (cardName: string) => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ isOpen, onClose, onDetected }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [ocrMode, setOcrMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHasKey(!!storage.getGeminiKey());
      setOcrMode(false);
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      setError(null);
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
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const performLocalOCR = async (image: string): Promise<string | null> => {
    try {
      const { data: { text } } = await Tesseract.recognize(image, 'eng');
      // Clean the text: take the first line and remove non-alphanumeric chars at start/end
      const firstLine = text.split('\n')[0].trim().replace(/[^a-zA-Z0-9 ',-]/g, '');
      if (firstLine.length > 3) {
        try {
          const names = await scryfall.getAutocomplete(firstLine);
          if (names.length > 0) return names[0];
          
          const fuzzyRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(firstLine)}`);
          if (fuzzyRes.ok) {
            const cardData = await fuzzyRes.json();
            return cardData.name;
          }
        } catch(e) {
          console.warn("Fuzzy search fallback failed");
        }
        return firstLine;
      }
      return null;
    } catch (err) {
      console.error("Local OCR error:", err);
      return null;
    }
  };

  const captureAndIdentify = async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;
    
    setIsCapturing(true);
    setError(null);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!context) return;

      // 1. Full Context Capture for Gemini (good for Moiré anti-aliasing and context)
      // Capturing a large portion (80% width, 60% height) instead of just the title
      const fullWidth = video.videoWidth * 0.8;
      const fullHeight = video.videoHeight * 0.6;
      const fullX = (video.videoWidth - fullWidth) / 2;
      const fullY = video.videoHeight * 0.1;

      canvas.width = fullWidth;
      canvas.height = fullHeight;
      context.filter = 'none'; // No filters to avoid breaking Gemini's visual recognition on LCD screens
      context.drawImage(video, fullX, fullY, fullWidth, fullHeight, 0, 0, fullWidth, fullHeight);
      
      const fullBase64Image = canvas.toDataURL('image/jpeg', 0.8);

      // 2. Title Bar Capture for Tesseract OCR Fallback
      const titleWidth = video.videoWidth * 0.8;
      const titleHeight = video.videoHeight * 0.08;
      const titleX = (video.videoWidth - titleWidth) / 2;
      const titleY = video.videoHeight * 0.1;

      // Temporary canvas just for the OCR crop
      const ocrCanvas = document.createElement('canvas');
      ocrCanvas.width = titleWidth;
      ocrCanvas.height = titleHeight;
      const ocrContext = ocrCanvas.getContext('2d', { willReadFrequently: true });
      
      if (ocrContext) {
        // Less destructive contrast for notebook screens (LCDs)
        ocrContext.filter = 'grayscale(100%) contrast(120%) brightness(110%) blur(0.5px)';
        ocrContext.drawImage(video, titleX, titleY, titleWidth, titleHeight, 0, 0, titleWidth, titleHeight);
      }
      
      const titleBarBase64Image = ocrCanvas.toDataURL('image/jpeg', 0.9);
      
      let cardName: string | null = null;
      
      try {
        // Feed the full contextual image to Gemini so it can read screen pixels properly
        cardName = await identifyCardFromImage(fullBase64Image);
      } catch (geminiError: any) {
        console.warn("Gemini failed, switching to OCR mode:", geminiError.message);
        setOcrMode(true);
        
        // Fallback to local OCR with the optimized title bar slice
        cardName = await performLocalOCR(titleBarBase64Image);
      }

      if (cardName) {
        onDetected(cardName);
        onClose();
      } else {
        setError("Não consegui identificar a carta. Tente focar melhor no nome.");
      }
    } catch (err) {
      console.error("Capture error:", err);
      setError("Erro ao processar imagem.");
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] bg-black flex flex-col">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                <Scan size={20} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold">Mana Vision</h3>
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Scanner de Cartas</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Camera View */}
          <div className="flex-1 relative overflow-hidden">
            {error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-6">
                <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-400">
                  <AlertCircle size={32} />
                </div>
                <p className="text-white/60 text-sm max-w-xs leading-relaxed">{error}</p>
                <button 
                  onClick={startCamera}
                  className="px-6 py-3 bg-white text-black rounded-xl font-bold text-sm"
                >
                  Tentar Novamente
                </button>
              </div>
            ) : (
              <>
                <video 
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                
                {/* Scanner Overlay */}
                <div className="absolute inset-0 flex flex-col items-center">
                  <div className="mt-[15vh] w-[85%] aspect-[3/1] border-2 border-purple-500/50 rounded-2xl relative">
                    {/* Corners */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-purple-500 rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-purple-500 rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-purple-500 rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-purple-500 rounded-br-lg" />
                    
                    {/* Scanning Line */}
                    <motion.div 
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      className="absolute left-0 right-0 h-0.5 bg-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.5)] z-10"
                    />
                    
                    <div className="absolute -bottom-12 left-0 right-0 text-center">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-purple-400 font-black drop-shadow-lg">
                        Alinhe o nome da carta aqui
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Controls */}
          <div className="p-10 bg-gradient-to-t from-black to-transparent flex flex-col items-center gap-6">
            {ocrMode && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center gap-2 text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-2"
              >
                <AlertCircle size={14} />
                Modo OCR Ativo (Gemini Indisponível)
              </motion.div>
            )}
            
            <button
              onClick={captureAndIdentify}
              disabled={isCapturing || !!error}
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-90 relative",
                isCapturing ? "bg-white/10" : "bg-white"
              )}
            >
              {isCapturing ? (
                <Loader2 size={32} className="animate-spin text-purple-500" />
              ) : (
                <Camera size={32} className="text-black" />
              )}
              
              {/* Outer Ring */}
              <div className="absolute -inset-2 border-2 border-white/20 rounded-full" />
            </button>
            
            <div className="flex items-center gap-2 text-white/40">
              <Sparkles size={14} />
              <p className="text-[10px] uppercase tracking-widest font-bold">
                {ocrMode ? "Processamento Local (Tesseract)" : "Powered by Gemini Vision"}
              </p>
            </div>
          </div>

          {/* Hidden Canvas for Processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </AnimatePresence>
  );
};
