
import React, { useRef, useEffect, useState } from 'react';
import { AsciiOptions } from '../types';
import { getAsciiChar } from '../utils/asciiConverter';
import { playStartupSound, playScanSound, startAmbientHum, stopAmbientHum } from '../utils/soundEffects';
import { ScanEye, Camera, RefreshCw } from 'lucide-react';

interface AsciiCanvasProps {
  options: AsciiOptions;
  onCapture: (imageData: string) => void;
}

export const AsciiCanvas: React.FC<AsciiCanvasProps> = ({ options, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<Float32Array | null>(null);
  const animationRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 }, 
            height: { ideal: 720 }, 
            facingMode: 'user' 
          } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsCameraReady(true);
          playStartupSound();
          startAmbientHum();
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("NEURAL LINK FAILURE: CAMERA PERMISSION DENIED");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      stopAmbientHum();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const parent = canvasRef.current.parentElement;
        if (parent) {
          canvasRef.current.width = parent.clientWidth;
          canvasRef.current.height = parent.clientHeight;
        }
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const renderLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const hiddenCanvas = hiddenCanvasRef.current;
      
      if (!video || !canvas || !hiddenCanvas || video.readyState < 2) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

      if (!ctx || !hiddenCtx) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      const charHeight = options.fontSize;
      const charWidth = charHeight * 0.6;
      const cols = Math.floor(canvas.width / charWidth);
      const rows = Math.floor(canvas.height / charHeight);

      if (cols <= 0 || rows <= 0) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      if (hiddenCanvas.width !== cols || hiddenCanvas.height !== rows) {
        hiddenCanvas.width = cols;
        hiddenCanvas.height = rows;
        prevFrameRef.current = null;
      }

      hiddenCtx.save();
      hiddenCtx.translate(cols, 0);
      hiddenCtx.scale(-1, 1);
      hiddenCtx.drawImage(video, 0, 0, cols, rows);
      hiddenCtx.restore();
      
      const frameData = hiddenCtx.getImageData(0, 0, cols, rows);
      const data = frameData.data;

      // Temporal Smoothing
      const pixelCount = data.length;
      if (!prevFrameRef.current || prevFrameRef.current.length !== pixelCount) {
        prevFrameRef.current = new Float32Array(pixelCount);
        for(let i=0; i<pixelCount; i++) prevFrameRef.current[i] = data[i];
      }
      const prev = prevFrameRef.current;
      const inertia = 0.65; 

      for (let i = 0; i < pixelCount; i++) {
        const target = data[i];
        const current = prev[i];
        const newValue = current + (target - current) * (1 - inertia);
        prev[i] = newValue;
        data[i] = newValue;
      }

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${options.fontSize}px 'JetBrains Mono', monospace`;
      ctx.textBaseline = 'top';

      const contrastFactor = (259 * (options.contrast * 255 + 255)) / (255 * (259 - options.contrast * 255));

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const offset = (y * cols + x) * 4;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          
          let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          brightness = contrastFactor * (brightness - 128) + 128;
          brightness *= options.brightness;
          brightness = Math.max(0, Math.min(255, brightness));

          const char = getAsciiChar(brightness, options.density);
          
          if (options.colorMode === 'color') {
            ctx.fillStyle = `rgb(${r},${g},${b})`;
          } else if (options.colorMode === 'matrix') {
            // Brighten green based on original pixel brightness
            const gVal = Math.min(255, 100 + brightness);
            ctx.fillStyle = `rgb(0, ${gVal}, 65)`;
          } else if (options.colorMode === 'retro') {
            ctx.fillStyle = '#ffb000';
          } else {
            ctx.fillStyle = '#ffffff';
          }
          
          ctx.fillText(char, x * charWidth, y * charHeight);
        }
      }

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    animationRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [options]);

  const handleCaptureClick = () => {
    if (canvasRef.current) {
      playScanSound();
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onCapture(dataUrl);
    }
  };

  const handleScreenshotClick = () => {
    if (canvasRef.current) {
      playScanSound();
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `cyber_ascii_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-red-500 z-50 p-8 text-center">
                <ShieldAlert className="w-16 h-16 mb-4 animate-pulse" />
                <h2 className="text-2xl font-bold mb-2">SYSTEM ERROR</h2>
                <p className="font-mono">{error}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="mt-6 border border-red-500 px-4 py-2 hover:bg-red-500/20 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  REBOOT SYSTEM
                </button>
            </div>
        )}
        
        <video 
            ref={videoRef} 
            className="absolute opacity-0 pointer-events-none -z-10 w-1 h-1" 
            playsInline 
            autoPlay 
            muted 
        />
        <canvas ref={hiddenCanvasRef} className="hidden" />
        <canvas ref={canvasRef} className="block w-full h-full object-contain" />

        {!isCameraReady && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-green-500 z-40 bg-black">
            <div className="w-12 h-12 border-2 border-green-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <span className="animate-pulse tracking-widest">INITIALIZING VISUAL FEED...</span>
          </div>
        )}
        
        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 flex items-center gap-8 z-40">
            <button 
                onClick={handleScreenshotClick}
                className="bg-black/60 hover:bg-green-900/80 text-green-400 border border-green-500/50 p-4 rounded-full backdrop-blur-md transition-all active:scale-95 hover:scale-110 hover:shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                title="Save Snapshot"
            >
                <Camera className="w-6 h-6" />
            </button>

            <button 
                onClick={handleCaptureClick}
                className="bg-green-500/20 hover:bg-green-500/40 text-green-400 border border-green-500/50 p-6 rounded-full backdrop-blur-md transition-all active:scale-95 group relative hover:shadow-[0_0_25px_rgba(0,255,0,0.5)]"
                title="Scan & Analyze"
            >
                <div className="absolute inset-0 rounded-full border border-green-500 opacity-50 animate-ping"></div>
                <ScanEye className="w-8 h-8" />
            </button>
        </div>

        {/* HUD Elements */}
        <div className="absolute inset-0 pointer-events-none border-[20px] border-green-500/5 z-20"></div>
        <div className="absolute top-10 right-10 text-[10px] text-green-500/40 font-mono z-20 hidden md:block">
           LATENCY: 14ms<br/>
           BUFFER: 1024KB<br/>
           RENDER: ASCII_GL
        </div>
    </div>
  );
};

// Internal icon for the error state
const ShieldAlert: React.FC<{className?: string}> = ({className}) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
  </svg>
);
