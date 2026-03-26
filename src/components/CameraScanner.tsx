import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Loader2, Sparkles, Scan, AlertCircle, Highlighter, RotateCcw, Check } from 'lucide-react';
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
  const [useAI, setUseAI] = useState(true);

  // Highlighter Feature States
  const [frozenImage, setFrozenImage] = useState<string | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [boundingBox, setBoundingBox] = useState<{ minX: number, minY: number, maxX: number, maxY: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setHasKey(!!storage.getGeminiKey());
      setOcrMode(false);
      resetScanner();
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const resetScanner = () => {
    setFrozenImage(null);
    setBoundingBox(null);
    setError(null);
    setIsDrawing(false);
  };

  const startCamera = async () => {
    try {
      resetScanner();
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

  // Step 1: Capture full view for drawing
  const captureImageForHighlighter = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Store full intrinsic resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    // Draw full frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    setFrozenImage(canvas.toDataURL('image/jpeg', 0.9));
  };

  // Setup drawing canvas size on freeze
  useEffect(() => {
    if (frozenImage && drawingCanvasRef.current) {
      const container = drawingCanvasRef.current.parentElement;
      if (container) {
        drawingCanvasRef.current.width = container.clientWidth;
        drawingCanvasRef.current.height = container.clientHeight;
      }
    }
  }, [frozenImage]);

  // Handle Drawing
  const getPos = (e: any, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: any) => {
    setIsDrawing(true);
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    
    // Set line styles for highlighter loop
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 35;
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)'; // Transparent yellow
    
    if (!boundingBox) {
      setBoundingBox({ minX: pos.x, minY: pos.y, maxX: pos.x, maxY: pos.y });
    }
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    setBoundingBox(prev => {
      if (!prev) return { minX: pos.x, minY: pos.y, maxX: pos.x, maxY: pos.y };
      return {
        minX: Math.min(prev.minX, pos.x),
        minY: Math.min(prev.minY, pos.y),
        maxX: Math.max(prev.maxX, pos.x),
        maxY: Math.max(prev.maxY, pos.y)
      };
    });
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const performLocalOCR = async (image: string): Promise<string | null> => {
    try {
      const { data: { text } } = await Tesseract.recognize(image, 'eng');
      // Assume the text might have newlines or noise, take first non-empty line
      const lines = text.split('\n').map(l => l.trim().replace(/[^a-zA-Z0-9 ',-]/g, '')).filter(l => l.length > 2);
      if (lines.length > 0) {
        const firstLine = lines[0];
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

  // Step 2: Read only the highlighted area
  const identifyHighlightedText = async () => {
    if (!frozenImage || !boundingBox || isCapturing) return;
    setIsCapturing(true);
    setError(null);

    try {
      const canvasDisplay = drawingCanvasRef.current;
      const originalCanvas = canvasRef.current;
      if (!canvasDisplay || !originalCanvas) return;

      const originalWidth = originalCanvas.width;
      const originalHeight = originalCanvas.height;
      const displayWidth = canvasDisplay.width;
      const displayHeight = canvasDisplay.height;
      
      const srcRatio = originalWidth / originalHeight;
      const dstRatio = displayWidth / displayHeight;
      
      let scale;
      let offsetX = 0;
      let offsetY = 0;
      
      if (dstRatio > srcRatio) {
        scale = displayWidth / originalWidth;
        offsetY = (displayHeight - (originalHeight * scale)) / 2;
      } else {
        scale = displayHeight / originalHeight;
        offsetX = (displayWidth - (originalWidth * scale)) / 2;
      }
      
      const padding = 20; // Visual padding
      const vizX = Math.max(0, boundingBox.minX - padding);
      const vizY = Math.max(0, boundingBox.minY - padding);
      const vizW = boundingBox.maxX - boundingBox.minX + padding * 2;
      const vizH = boundingBox.maxY - boundingBox.minY + padding * 2;
      
      // Map to original coordinates
      const sx = (vizX - offsetX) / scale;
      const sy = (vizY - offsetY) / scale;
      const sWidth = vizW / scale;
      const sHeight = vizH / scale;
      
      const finalSx = Math.max(0, sx);
      const finalSy = Math.max(0, sy);
      const finalSWidth = Math.min(originalWidth - finalSx, sWidth);
      const finalSHeight = Math.min(originalHeight - finalSy, sHeight);

      // Create cropped image
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = finalSWidth;
      cropCanvas.height = finalSHeight;
      const ctx = cropCanvas.getContext('2d');
      if (!ctx) return;

      // Destrói o efeito Moiré suavizando a grade RGB de monitores
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = 'grayscale(100%) blur(1.2px) contrast(300%) brightness(130%)';
      ctx.drawImage(originalCanvas, finalSx, finalSy, finalSWidth, finalSHeight, 0, 0, finalSWidth, finalSHeight);
      
      const croppedBase64 = cropCanvas.toDataURL('image/png'); // PNG for lossless text
      let cardName: string | null = null;
      
      if (useAI) {
        try {
          cardName = await identifyCardFromImage(croppedBase64);
        } catch (geminiError: any) {
          console.warn("Gemini failed, switching to OCR mode:", geminiError.message);
          setOcrMode(true);
          cardName = await performLocalOCR(croppedBase64);
        }
      } else {
        setOcrMode(true);
        cardName = await performLocalOCR(croppedBase64);
      }

      if (cardName) {
        onDetected(cardName);
        handleClose();
      } else {
        setError("Não consegui ler o texto em destaque. Tente iluminar melhor ou destacar novamente.");
      }
    } catch (err) {
      console.error("Highlight OCR error:", err);
      setError("Erro ao processar o recorte.");
    } finally {
      setIsCapturing(false);
    }
  };

  const handleClose = () => {
    resetScanner();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] bg-black flex flex-col">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                <Scan size={20} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold">Mana Vision</h3>
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Scanner Interativo</p>
              </div>
            </div>
            <button 
              onClick={handleClose}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
            >
              <X size={24} />
            </button>
          </div>

          {/* Viewport */}
          <div className="flex-1 relative overflow-hidden bg-[#0A0A0A]">
            {error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-6 z-20 bg-black/50 backdrop-blur-sm">
                <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-400">
                  <AlertCircle size={32} />
                </div>
                <p className="text-white/60 text-sm max-w-xs leading-relaxed">{error}</p>
                <div className="flex gap-4">
                  <button 
                    onClick={resetScanner}
                    className="px-6 py-3 bg-white/10 text-white rounded-xl font-bold text-sm"
                  >
                    Repetir Foto
                  </button>
                  {frozenImage && boundingBox && (
                    <button 
                      onClick={identifyHighlightedText}
                      className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold text-sm"
                    >
                      Tentar Leitura
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {!frozenImage ? (
              <>
                <video 
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                
                {/* Scanner Overlay */}
                <div className="absolute inset-0 flex flex-col items-center pointer-events-none">
                  <div className="mt-[15vh] w-[85%] aspect-[3/1] border-2 border-purple-500/50 rounded-2xl relative">
                    {/* Corners */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-purple-500 rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-purple-500 rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-purple-500 rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-purple-500 rounded-br-lg" />
                    
                    <div className="absolute -bottom-12 left-0 right-0 text-center">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-white/80 font-black drop-shadow-lg">
                        Enquadre o texto que deseja ler
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center bg-black">
                {/* Frozen Image */}
                <img 
                  src={frozenImage} 
                  className="w-full h-full object-cover select-none pointer-events-none" 
                  alt="Captured"
                />
                
                <div className="absolute inset-x-0 top-32 flex justify-center pointer-events-none">
                  <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-2 animate-pulse">
                    <Highlighter size={16} className="text-yellow-400" />
                    <span className="text-white text-xs font-bold uppercase tracking-wider">
                      Pinte o nome da carta
                    </span>
                  </div>
                </div>

                {/* Drawing Surface */}
                <canvas 
                  ref={drawingCanvasRef}
                  className="absolute inset-0 w-full h-full touch-none cursor-crosshair z-10"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="p-8 pb-12 bg-black flex flex-col items-center gap-6 z-20">
            {ocrMode && (
              <div className="px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center gap-2 text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                <AlertCircle size={14} />
                Modo OCR Tesseract (Gemini Indisponível)
              </div>
            )}
            
            {!frozenImage ? (
              // Capture State
              <div className="flex flex-col items-center">
                <button
                  onClick={captureImageForHighlighter}
                  disabled={isCapturing}
                  className="w-20 h-20 rounded-full bg-white flex items-center justify-center transition-all active:scale-90 relative"
                >
                  <Camera size={32} className="text-black" />
                  <div className="absolute -inset-2 border-2 border-white/20 rounded-full" />
                </button>
                <button 
                  onClick={() => setUseAI(!useAI)}
                  className="mt-6 flex items-center gap-2 p-2 rounded-xl transition-all hover:bg-white/5 active:scale-95 border border-transparent"
                  style={{ borderColor: useAI ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.1)' }}
                >
                  {useAI ? (
                    <>
                      <Sparkles size={14} className="text-purple-400" />
                      <p className="text-[10px] uppercase tracking-widest font-bold text-purple-400">
                        Inteligência Artificial Ativada
                      </p>
                    </>
                  ) : (
                    <>
                      <Scan size={14} className="text-white/60" />
                      <p className="text-[10px] uppercase tracking-widest font-bold text-white/60">
                        Scanner Offline Rápido (Economia de IA)
                      </p>
                    </>
                  )}
                </button>
              </div>
            ) : (
              // Highlight State
              <div className="w-full max-w-sm flex items-center justify-between gap-4">
                <button
                  onClick={resetScanner}
                  disabled={isCapturing}
                  className="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center gap-2 text-white transition-all active:scale-95 text-sm font-bold"
                >
                  <RotateCcw size={18} />
                  Voltar
                </button>

                <button
                  onClick={identifyHighlightedText}
                  disabled={isCapturing || !boundingBox}
                  className={cn(
                    "flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 text-white transition-all active:scale-95 text-sm font-bold",
                    !boundingBox ? "bg-purple-600/50 opacity-50 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.4)]"
                  )}
                >
                  {isCapturing ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Check size={18} />
                  )}
                  {isCapturing ? "Lendo..." : "Ler Texto"}
                </button>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </AnimatePresence>
  );
};
