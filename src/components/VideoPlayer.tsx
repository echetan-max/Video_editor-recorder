import React, { forwardRef, useEffect, useRef, useState, useImperativeHandle } from 'react';
import { Play, Pause, Volume2, Maximize, VolumeX } from 'lucide-react';
import { ZoomEffect, TextOverlay } from '../types';

const DEBUG_CAPTURE = false;

interface VideoPlayerProps {
  src: string;
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onLoadedMetadata: (duration: number) => void;
  onPlay: () => void;
  onPause: () => void;
  currentZoom: ZoomEffect | null;
  textOverlays: TextOverlay[];
  previewTextOverlay?: TextOverlay | null;
  onVideoClick: (x: number, y: number) => void;
  onSeeked?: () => void;
}

export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  seekAndWait: (time: number) => Promise<void>;
  captureFrameCanvas: (zoomEffects: ZoomEffect[], textOverlays: TextOverlay[]) => Promise<HTMLCanvasElement>;
  captureFrame: (zoomEffects: ZoomEffect[], textOverlays: TextOverlay[]) => Promise<Blob>;
  /** NEW: lock UI + pause during export, update overlay %, then unlock */
  beginExport: () => void;
  updateExportProgress: (percent: number, message?: string) => void;
  endExport: () => void;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  ({ src, currentTime, isPlaying, onTimeUpdate, onLoadedMetadata, onPlay, onPause, currentZoom, textOverlays, previewTextOverlay, onVideoClick, onSeeked }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const videoWrapperRef = useRef<HTMLDivElement>(null);

    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Export lock + UI
    const [exportOverlay, setExportOverlay] = useState<{active: boolean; percent: number; message: string}>({
      active: false, percent: 0, message: 'Preparing…'
    });
    const suppressTimeUpdateRef = useRef(false);

    /** drawer that returns a fully drawn canvas (no ImageData) */
    const drawFrameToCanvas = async (zoomEffects: ZoomEffect[], overlays: TextOverlay[]) => {
      if (!videoRef.current || !isVideoReady) throw new Error('Video not ready for capture');
      const video = videoRef.current;

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const W = video.videoWidth;
      const H = video.videoHeight;

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = W;
      frameCanvas.height = H;
      const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
      frameCtx.clearRect(0, 0, W, H);

      // base frame
      frameCtx.drawImage(video, 0, 0, W, H);

      // zoom via source rect
      const zoom = zoomEffects[0];
      if (zoom) {
        const bmp = await createImageBitmap(frameCanvas);
        const cx = (zoom.x / 100) * W;
        const cy = (zoom.y / 100) * H;
        const sw = W / zoom.scale;
        const sh = H / zoom.scale;
        const sx = Math.max(0, Math.min(W - sw, cx - sw / 2));
        const sy = Math.max(0, Math.min(H - sh, cy - sh / 2));
        frameCtx.clearRect(0, 0, W, H);
        frameCtx.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);
        bmp.close?.();

        if (DEBUG_CAPTURE) {
          console.debug('[captureFrameCanvas] zoom', { x: zoom.x, y: zoom.y, scale: zoom.scale, srcRect: { sx, sy, sw, sh } });
        }
      }

      // overlays
      if (overlays.length > 0) {
        frameCtx.textAlign = 'center';
        frameCtx.textBaseline = 'middle';
        for (const overlay of overlays) {
          const text = overlay.text || '';
          const lines = text.split('\n');
          const fontSize = overlay.fontSize || 24;
          const fontFamily = overlay.fontFamily || 'Arial';
          const color = overlay.color || '#ffffff';
          const backgroundColor = overlay.backgroundColor || 'transparent';
          const padding = overlay.padding || 8;
          const borderRadius = overlay.borderRadius || 4;
          const lineHeight = 1.2;

          frameCtx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;

          const metrics = lines.map((line) => frameCtx.measureText(line));
          const maxWidth = Math.max(...metrics.map((m) => m.width));
          const totalTextHeight = lines.length * fontSize * lineHeight;

          const rectWidth = maxWidth + 2 * padding;
          const rectHeight = totalTextHeight + 2 * padding;
          const xPos = (overlay.x / 100) * W;
          const yPos = (overlay.y / 100) * H;
          const rectX = xPos - rectWidth / 2;
          const rectY = yPos - rectHeight / 2;

          if (backgroundColor && backgroundColor !== 'transparent') {
            frameCtx.fillStyle = backgroundColor;
            frameCtx.beginPath();
            if ('roundRect' in frameCtx && borderRadius > 0) {
              (frameCtx as CanvasRenderingContext2D).roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
            } else {
              frameCtx.rect(rectX, rectY, rectWidth, rectHeight);
            }
            frameCtx.fill();
          }

          frameCtx.fillStyle = color;
          frameCtx.strokeStyle = 'black';
          frameCtx.lineWidth = fontSize * 0.05;

          lines.forEach((line, index) => {
            const lineY = yPos - totalTextHeight / 2 + index * fontSize * lineHeight + (fontSize * lineHeight) / 2;
            frameCtx.strokeText(line, xPos, lineY);
            frameCtx.fillText(line, xPos, lineY);
          });
        }
      }

      return frameCanvas;
    };

    useImperativeHandle(ref, () => ({
      play: () => { if (videoRef.current && isVideoReady && !exportOverlay.active) videoRef.current.play().catch(console.error); },
      pause: () => { videoRef.current?.pause(); },
      seek: (time: number) => { if (videoRef.current && isVideoReady) videoRef.current.currentTime = time; },
      seekAndWait: async (time: number) => {
        if (!videoRef.current || !isVideoReady) throw new Error('Video not ready');
        const video = videoRef.current;
        return new Promise<void>((resolve) => {
          const handleSeeked = () => { video.removeEventListener('seeked', handleSeeked); resolve(); };
          video.addEventListener('seeked', handleSeeked);
          video.currentTime = time;
        });
      },
      captureFrameCanvas: async (zoomEffects, overlays) => drawFrameToCanvas(zoomEffects, overlays),
      captureFrame: async (zoomEffects, overlays) => {
        const c = await drawFrameToCanvas(zoomEffects, overlays);
        const blob: Blob = await new Promise((resolve) => c.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.92));
        return blob;
      },
      // NEW: export lock API
      beginExport: () => {
        videoRef.current?.pause();
        suppressTimeUpdateRef.current = true;
        setExportOverlay({ active: true, percent: 0, message: 'Preparing…' });
      },
      updateExportProgress: (percent, message = '') => {
        setExportOverlay(prev => prev.active ? { active: true, percent: Math.max(0, Math.min(100, Math.round(percent))), message } : prev);
      },
      endExport: () => {
        suppressTimeUpdateRef.current = false;
        setExportOverlay({ active: false, percent: 0, message: '' });
      }
    }));

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleLoadedMetadata = () => {
        setIsVideoReady(true);
        setVideoError(null);
        setIsLoading(false);
        onLoadedMetadata(video.duration);
      };

      const handleTimeUpdate = () => {
        if (!suppressTimeUpdateRef.current) onTimeUpdate(video.currentTime);
      };

      const handlePlay = () => onPlay();
      const handlePause = () => onPause();
      const handleLoadedData = () => setIsVideoReady(true);
      const handleError = (e: Event) => {
        console.error('Video loading error:', e, video.error, video.src);
        const msg = video.error?.message || 'Unknown error';
        setVideoError(msg);
        alert(`Error loading video: ${msg}`);
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('error', handleError);
      };
    }, [src, onTimeUpdate, onLoadedMetadata, onPlay, onPause]);

    useEffect(() => { setIsVideoReady(false); setVideoError(null); setIsLoading(true); }, [src]);

    useEffect(() => {
      const v = videoRef.current; if (!v || !isVideoReady) return;
      if (exportOverlay.active) { v.pause(); return; } // hard-stop during export
      if (isPlaying) v.play().catch(console.error); else v.pause();
    }, [isPlaying, isVideoReady, exportOverlay.active]);

    useEffect(() => {
      const v = videoRef.current; if (!v || !isVideoReady) return;
      if (Math.abs(v.currentTime - currentTime) > 0.1) v.currentTime = currentTime;
    }, [currentTime, isVideoReady]);

    useEffect(() => { const v = videoRef.current; if (v) v.volume = isMuted ? 0 : volume; }, [volume, isMuted]);

    // preview transform
    useEffect(() => {
      if (currentZoom) {
        const { x, y, scale } = currentZoom;
        const offsetX = (50 - x) * (scale - 1);
        const offsetY = (50 - y) * (scale - 1);
        const dur = currentZoom.transition === 'smooth' ? '0.6s' : '0.2s';
        const ease = 'cubic-bezier(0.4, 0.0, 0.2, 1)';
        videoWrapperRef.current?.style.setProperty('transform', `scale(${scale.toFixed(3)}) translate(${offsetX.toFixed(3)}%, ${offsetY.toFixed(3)}%)`);
        videoWrapperRef.current?.style.setProperty('transform-origin', 'center center');
        videoWrapperRef.current?.style.setProperty('transition', `transform ${dur} ${ease}`);
        videoWrapperRef.current?.style.setProperty('will-change', 'transform');
      } else {
        videoWrapperRef.current?.style.setProperty('transform', 'none');
        videoWrapperRef.current?.style.setProperty('transform-origin', 'center center');
        videoWrapperRef.current?.style.setProperty('transition', 'none');
        videoWrapperRef.current?.style.setProperty('will-change', 'none');
      }
    }, [currentZoom]);

    const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      onVideoClick(x, y);
    };

    const togglePlayPause = () => (isPlaying ? onPause() : onPlay());
    const toggleMute = () => setIsMuted(!isMuted);
    const toggleFullscreen = async () => {
      if (!document.fullscreenElement) { await containerRef.current?.requestFullscreen(); setIsFullscreen(true); }
      else { await document.exitFullscreen(); setIsFullscreen(false); }
    };

    useEffect(() => {
      const onFS = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', onFS);
      return () => document.removeEventListener('fullscreenchange', onFS);
    }, []);

    const getZoomIndicatorPosition = () => {
      const z = currentZoom || null;
      if (!z || !videoRef.current || !videoWrapperRef.current) return { left: '50%', top: '50%' };
      return { left: `${z.x}%`, top: `${z.y}%` };
    };

    return (
      <div className={`flex-1 flex items-center justify-center bg-black relative overflow-hidden group h-full ${isFullscreen ? 'fullscreen' : ''}`}>
        {(isLoading || (!isVideoReady && !videoError)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <div className="text-white text-center">
              <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Loading video...</p>
              <p className="text-sm text-gray-400 mt-2">{src}</p>
            </div>
          </div>
        )}

        {videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/50 z-10">
            <div className="text-white text-center p-6 bg-red-800 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Video Loading Error</h3>
              <p className="text-red-200 mb-4">{videoError}</p>
              <p className="text-sm text-gray-300">File: {src}</p>
              <button
                onClick={() => { setVideoError(null); setIsLoading(true); videoRef.current?.load(); }}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div className="relative w-full h-full flex items-center justify-center" ref={containerRef}>

          {/* BLOCKING EXPORT OVERLAY */}
          {exportOverlay.active && (
            <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white pointer-events-auto">
              <div className="w-64">
                <div className="mb-3 text-center text-sm opacity-80">{exportOverlay.message || 'Exporting…'}</div>
                <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                  <div className="bg-purple-500 h-2 rounded-full transition-all duration-150" style={{ width: `${exportOverlay.percent}%` }} />
                </div>
                <div className="text-center text-sm">{exportOverlay.percent}%</div>
              </div>
              <div className="mt-4 text-xs opacity-70">Export is running — playback is paused</div>
            </div>
          )}

          <div
            className="relative w-full h-full max-w-full max-h-full"
            style={{ backfaceVisibility: 'hidden', perspective: '1000px', transformStyle: 'preserve-3d' }}
            ref={videoWrapperRef}
          >
            <video
              ref={videoRef}
              src={src}
              className="w-full h-full max-w-full max-h-full cursor-pointer block object-contain"
              onClick={handleVideoClick}
              preload="metadata"
              playsInline
              crossOrigin="anonymous"
              muted={isMuted}
              controls={false}
              onLoadStart={() => setIsLoading(true)}
              onSeeked={onSeeked}
            />

            {currentZoom && isVideoReady && !exportOverlay.active && (
              <div
                className="absolute w-3 h-3 bg-purple-500 border-2 border-white rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={getZoomIndicatorPosition()}
              />
            )}

            {textOverlays.map((o) => {
              const active = currentTime >= o.startTime && currentTime <= o.endTime;
              if (!active) return null;
              return (
                <div
                  key={o.id}
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: `${o.x}%`, top: `${o.y}%`,
                    transform: 'translate(-50%, -50%)',
                    fontFamily: o.fontFamily || 'Arial, sans-serif',
                    fontSize: `${o.fontSize || 24}px`,
                    color: o.color || '#ffffff',
                    backgroundColor: o.backgroundColor || 'transparent',
                    padding: `${o.padding || 0}px`,
                    borderRadius: `${o.borderRadius || 0}px`,
                    whiteSpace: 'pre-wrap', textAlign: 'center',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    boxShadow: o.backgroundColor ? '2px 2px 8px rgba(0,0,0,0.5)' : 'none',
                    maxWidth: '80%', wordWrap: 'break-word', fontWeight: 'bold', lineHeight: '1.2'
                  }}
                >
                  {o.text}
                </div>
              );
            })}

            {previewTextOverlay && !exportOverlay.active && (
              <div
                className="absolute pointer-events-none z-30"
                style={{
                  left: `${previewTextOverlay.x}%`,
                  top: `${previewTextOverlay.y}%`,
                  transform: 'translate(-50%, -50%)',
                  fontFamily: previewTextOverlay.fontFamily || 'Arial, sans-serif',
                  fontSize: `${previewTextOverlay.fontSize || 24}px`,
                  color: previewTextOverlay.color || '#ffffff',
                  backgroundColor: previewTextOverlay.backgroundColor || 'transparent',
                  padding: `${previewTextOverlay.padding || 0}px`,
                  borderRadius: `${previewTextOverlay.borderRadius || 0}px`,
                  whiteSpace: 'pre-wrap', textAlign: 'center',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                  boxShadow: previewTextOverlay.backgroundColor ? '2px 2px 8px rgba(0,0,0,0.5)' : 'none',
                  maxWidth: '80%', wordWrap: 'break-word', fontWeight: 'bold', lineHeight: '1.2',
                  border: '2px dashed #00ff00', opacity: 0.9
                }}
              >
                {previewTextOverlay.text}
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={togglePlayPause} className="text-white hover:text-purple-400 transition-colors" disabled={!isVideoReady || exportOverlay.active}>
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </button>
              <div className="flex items-center space-x-2">
                <button onClick={toggleMute} className="text-white hover:text-purple-400 transition-colors" disabled={exportOverlay.active}>
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range" min="0" max="1" step="0.1" value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-20 accent-purple-500"
                  disabled={exportOverlay.active}
                />
              </div>
            </div>
            <button
              onClick={toggleFullscreen}
              className={`text-white hover:text-purple-400 transition-colors ${isFullscreen ? 'text-purple-400' : ''}`}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              disabled={exportOverlay.active}
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!currentZoom && isVideoReady && !exportOverlay.active && (
          <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm opacity-60">
            Click on video to add zoom effect
          </div>
        )}

        {currentZoom && !exportOverlay.active && (
          <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm">
            {`Zoom: ${currentZoom.scale.toFixed(1)}x at (${currentZoom.x.toFixed(0)}%, ${currentZoom.y.toFixed(0)}%)`}
          </div>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';
