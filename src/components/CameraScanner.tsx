import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Loader2, Sparkles, Scan, AlertCircle } from 'lucide-react';
import { identifyCardFromImage } from '../lib/gemini';
import { storage } from '../lib/storage';
import { cn } from '../lib/utils';
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
      const firstLine = text.split('\n')[0].trim();
      if (firstLine.length > 3) return firstLine;
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
      const context = canvas.getContext('2d');
      
      if (!context) return;

      // Define the crop area (the scanner rectangle)
      const scanWidth = video.videoWidth * 0.8;
      const scanHeight = video.videoHeight * 0.3;
      const scanX = (video.videoWidth - scanWidth) / 2;
      const scanY = video.videoHeight * 0.1;

      canvas.width = scanWidth;
      canvas.height = scanHeight;
      
      context.drawImage(
        video, 
        scanX, scanY, scanWidth, scanHeight,
        0, 0, scanWidth, scanHeight
      );

      const base64Image = canvas.toDataURL('image/jpeg', 0.8);
      
      let cardName: string | null = null;
      
      try {
        cardName = await identifyCardFromImage(base64Image);
      } catch (geminiError: any) {
        console.warn("Gemini failed, switching to OCR mode:", geminiError.message);
        setOcrMode(true);
        
        // Fallback to local OCR
        cardName = await performLocalOCR(base64Image);
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
