import React, { forwardRef, useEffect, useRef, useState, useImperativeHandle } from 'react';
import { Play, Pause, Volume2, Maximize, VolumeX } from 'lucide-react';
import { ZoomEffect, TextOverlay } from '../types';

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
  onSeeked?: () => void; // NEW
}

export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  seekAndWait: (time: number) => Promise<void>;
  captureFrame: (zoomEffects: ZoomEffect[], textOverlays: TextOverlay[]) => Promise<ImageData>;
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

    useImperativeHandle(ref, () => ({
      play: () => {
        if (videoRef.current && isVideoReady) {
          videoRef.current.play().catch(console.error);
        }
      },
      pause: () => {
        if (videoRef.current) {
          videoRef.current.pause();
        }
      },
      seek: (time: number) => {
        if (videoRef.current && isVideoReady) {
          videoRef.current.currentTime = time;
        }
      },
      seekAndWait: async (time: number) => {
        if (!videoRef.current || !isVideoReady) {
          throw new Error('Video not ready');
        }
        
        const video = videoRef.current;
        return new Promise<void>((resolve) => {
          const handleSeeked = () => {
            video.removeEventListener('seeked', handleSeeked);
            resolve();
          };
          
          video.addEventListener('seeked', handleSeeked);
          video.currentTime = time;
        });
      },
      captureFrame: async (zoomEffects: ZoomEffect[], textOverlays: TextOverlay[]): Promise<ImageData> => {
        if (!videoRef.current || !isVideoReady) {
          throw new Error('Video not ready for capture');
        }

        const video = videoRef.current;
        
        // Ensure frame is fully loaded with proper TypeScript types
        await new Promise<void>((resolve) => {
          const rafCallback = () => {
            requestAnimationFrame(() => resolve());
          };
          requestAnimationFrame(rafCallback);
        });

        // Create capture canvas with memory-optimized dimensions
        const frameCanvas = document.createElement('canvas');
        const frameCtx = frameCanvas.getContext('2d')!;
        
        // Optimize canvas size for memory efficiency while maintaining quality
        const maxWidth = 1920;  // Max 1080p width for memory efficiency
        const maxHeight = 1080; // Max 1080p height for memory efficiency
        const videoAspectRatio = video.videoWidth / video.videoHeight;
        
        let canvasWidth = Math.min(video.videoWidth, maxWidth);
        let canvasHeight = Math.min(video.videoHeight, maxHeight);
        
        // Maintain aspect ratio
        if (canvasWidth / canvasHeight !== videoAspectRatio) {
          if (canvasWidth / videoAspectRatio <= maxHeight) {
            canvasHeight = Math.round(canvasWidth / videoAspectRatio);
          } else {
            canvasWidth = Math.round(canvasHeight * videoAspectRatio);
          }
        }
        
        frameCanvas.width = canvasWidth;
        frameCanvas.height = canvasHeight;

        // Draw the base video frame
        frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

        // Apply zoom effect passed in (already filtered/interpolated by caller)
        const zoom = zoomEffects[0];
        if (zoom) {
          // Create temp canvas for zoom operation
          const zoomCanvas = document.createElement('canvas');
          const zoomCtx = zoomCanvas.getContext('2d')!;
          zoomCanvas.width = frameCanvas.width;
          zoomCanvas.height = frameCanvas.height;

          // Copy original frame
          zoomCtx.drawImage(frameCanvas, 0, 0);

          // Clear frame canvas
          frameCtx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);

          // Apply zoom transform with improved precision
          frameCtx.save();
          const centerX = frameCanvas.width / 2;
          const centerY = frameCanvas.height / 2;
          
          // Calculate precise offsets
          const normalizedX = zoom.x / 100;
          const normalizedY = zoom.y / 100;
          const offsetX = (0.5 - normalizedX) * frameCanvas.width * (zoom.scale - 1);
          const offsetY = (0.5 - normalizedY) * frameCanvas.height * (zoom.scale - 1);
          
          frameCtx.translate(centerX + offsetX, centerY + offsetY);
          frameCtx.scale(zoom.scale, zoom.scale);
          frameCtx.translate(-centerX, -centerY);
          
          // Draw zoomed frame
          frameCtx.drawImage(zoomCanvas, 0, 0);
          frameCtx.restore();
          
          // Clean up zoom canvas immediately
          zoomCanvas.width = 0;
          zoomCanvas.height = 0;
        }

        // Apply text overlays passed in (already filtered by caller)
        if (textOverlays.length > 0) {
          frameCtx.textAlign = 'center';
          frameCtx.textBaseline = 'middle';

          for (const overlay of textOverlays) {
            // Get overlay properties with defaults
            const text = overlay.text || '';
            const lines = text.split('\n');
            const fontSize = overlay.fontSize || 24;
            const fontFamily = overlay.fontFamily || 'Arial';
            const color = overlay.color || '#ffffff';
            const backgroundColor = overlay.backgroundColor || 'transparent';
            const padding = overlay.padding || 8;
            const borderRadius = overlay.borderRadius || 4;
            const lineHeight = 1.2; // Matches CSS line-height

            // Configure font for measurement and drawing
            frameCtx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;

            // Measure text to calculate background size
            const textMetrics = lines.map(line => frameCtx.measureText(line));
            const maxWidth = Math.max(...textMetrics.map(m => m.width));
            const totalTextHeight = lines.length * fontSize * lineHeight;

            // Calculate background rectangle properties
            const rectWidth = maxWidth + 2 * padding;
            const rectHeight = totalTextHeight + 2 * padding;
            const xPos = (overlay.x / 100) * frameCanvas.width;
            const yPos = (overlay.y / 100) * frameCanvas.height;
            const rectX = xPos - rectWidth / 2;
            const rectY = yPos - rectHeight / 2;

            // Draw background rectangle if a color is set
            if (backgroundColor && backgroundColor !== 'transparent') {
              frameCtx.fillStyle = backgroundColor;
              frameCtx.beginPath();
              // Use roundRect for rounded corners, with a fallback to a regular rectangle
              if (frameCtx.roundRect && borderRadius > 0) {
                frameCtx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
              } else {
                frameCtx.rect(rectX, rectY, rectWidth, rectHeight);
              }
              frameCtx.fill();
            }

            // Draw text lines with a stroke for better visibility
            frameCtx.fillStyle = color;
            frameCtx.strokeStyle = 'black';
            frameCtx.lineWidth = fontSize * 0.05; // Add proper stroke width
            
            // Draw each line separately for better positioning
            lines.forEach((line, index) => {
              const lineY = yPos - (totalTextHeight / 2) + (index * fontSize * lineHeight) + (fontSize * lineHeight / 2);
              frameCtx.strokeText(line, xPos, lineY);
              frameCtx.fillText(line, xPos, lineY);
            });
          }
        }

        // Get image data and clean up canvas immediately
        const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
        
        // Clean up canvas to free memory
        frameCanvas.width = 0;
        frameCanvas.height = 0;
        
        return imageData;
      }
    }));

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleLoadedMetadata = () => {
        console.log('Video metadata loaded:', {
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          src: video.src
        });
        setIsVideoReady(true);
        setVideoError(null);
        setIsLoading(false);
        onLoadedMetadata(video.duration);
      };

      const handleTimeUpdate = () => {
        onTimeUpdate(video.currentTime);
      };

      const handlePlay = () => {
        onPlay();
      };

      const handlePause = () => {
        onPause();
      };

      const handleLoadedData = () => {
        console.log('Video data loaded successfully');
        setIsVideoReady(true);
      };

      const handleError = (e: Event) => {
        console.error('Video loading error:', e);
        console.error('Video error details:', video.error);
        console.error('Video src:', video.src);
        const errorMessage = video.error?.message || 'Unknown error';
        setVideoError(errorMessage);
        alert(`Error loading video: ${errorMessage}`);
      };

      const handleCanPlay = () => {
        console.log('Video can play');
      };

      const handleCanPlayThrough = () => {
        console.log('Video can play through');
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('error', handleError);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('canplaythrough', handleCanPlayThrough);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('error', handleError);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
      };
    }, [src, onTimeUpdate, onLoadedMetadata, onPlay, onPause]);

    // Reset video state when src changes
    useEffect(() => {
      setIsVideoReady(false);
      setVideoError(null);
      setIsLoading(true);
      console.log('Video src changed to:', src);
    }, [src]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !isVideoReady) return;

      if (isPlaying) {
        video.play().catch(console.error);
      } else {
        video.pause();
      }
    }, [isPlaying, isVideoReady]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !isVideoReady) return;

      if (Math.abs(video.currentTime - currentTime) > 0.1) {
        video.currentTime = currentTime;
      }
    }, [currentTime, isVideoReady]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      video.volume = isMuted ? 0 : volume;
    }, [volume, isMuted]);

    // Simplified transition animation - removed complex logic
    useEffect(() => {
      if (currentZoom) {
        // If we have a current zoom, use it with smooth transitions
        const { x, y, scale } = currentZoom;
        const offsetX = (50 - x) * (scale - 1);
        const offsetY = (50 - y) * (scale - 1);
        
        // Use optimized transition for better performance
        const transitionDuration = currentZoom.transition === 'smooth' ? '0.6s' : '0.2s';
        const easingCurve = 'cubic-bezier(0.4, 0.0, 0.2, 1)'; // Optimized for performance
        
        videoWrapperRef.current?.style.setProperty('transform', `scale(${scale.toFixed(3)}) translate(${offsetX.toFixed(3)}%, ${offsetY.toFixed(3)}%)`);
        videoWrapperRef.current?.style.setProperty('transform-origin', 'center center');
        videoWrapperRef.current?.style.setProperty('transition', `transform ${transitionDuration} ${easingCurve}`);
        videoWrapperRef.current?.style.setProperty('will-change', 'transform'); // Optimize for GPU acceleration
      } else {
        // If no zoom, reset transform
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

    const togglePlayPause = () => {
      if (isPlaying) {
        onPause();
      } else {
        onPlay();
      }
    };

    const toggleMute = () => {
      setIsMuted(!isMuted);
    };

    const toggleFullscreen = async () => {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    };

    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const getTransformStyle = () => {
      // Transform is now handled directly in useEffect
      return {};
    };

    const getZoomIndicatorPosition = () => {
      const activeZoom = currentZoom || null;
      
      if (!activeZoom || !videoRef.current || !videoWrapperRef.current) {
        return { left: '50%', top: '50%' };
      }

      return {
        left: `${activeZoom.x}%`,
        top: `${activeZoom.y}%`
      };
    };

    return (
      <div className={`flex-1 flex items-center justify-center bg-black relative overflow-hidden group h-full ${isFullscreen ? 'fullscreen' : ''}`}>
        {/* Loading Indicator */}
        {(isLoading || (!isVideoReady && !videoError)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <div className="text-white text-center">
              <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Loading video...</p>
              <p className="text-sm text-gray-400 mt-2">{src}</p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/50 z-10">
            <div className="text-white text-center p-6 bg-red-800 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Video Loading Error</h3>
              <p className="text-red-200 mb-4">{videoError}</p>
              <p className="text-sm text-gray-300">File: {src}</p>
              <button 
                onClick={() => {
                  setVideoError(null);
                  setIsLoading(true);
                  if (videoRef.current) {
                    videoRef.current.load();
                  }
                }}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Video Container */}
        <div 
          className="relative w-full h-full flex items-center justify-center"
          ref={containerRef}
        >
          {/* Video Wrapper with Zoom */}
          <div 
            className="relative w-full h-full max-w-full max-h-full"
            style={{
              ...getTransformStyle(),
              backfaceVisibility: 'hidden', // Optimize for GPU
              perspective: '1000px', // Enable 3D transforms
              transformStyle: 'preserve-3d' // Better GPU acceleration
            }}
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
            
            {/* Zoom Position Indicator - positioned relative to video */}
            {currentZoom && isVideoReady && (
              <div
                className="absolute w-3 h-3 bg-purple-500 border-2 border-white rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={getZoomIndicatorPosition()}
              />
            )}

            {/* Text Overlays */}
            {textOverlays.map((textOverlay) => {
              const isActive = currentTime >= textOverlay.startTime && currentTime <= textOverlay.endTime;
              if (!isActive) return null;

              return (
                <div
                  key={textOverlay.id}
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: `${textOverlay.x}%`,
                    top: `${textOverlay.y}%`,
                    transform: 'translate(-50%, -50%)',
                    fontFamily: textOverlay.fontFamily || 'Arial, sans-serif',
                    fontSize: `${textOverlay.fontSize || 24}px`,
                    color: textOverlay.color || '#ffffff',
                    backgroundColor: textOverlay.backgroundColor || 'transparent',
                    padding: `${textOverlay.padding || 0}px`,
                    borderRadius: `${textOverlay.borderRadius || 0}px`,
                    whiteSpace: 'pre-wrap',
                    textAlign: 'center',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    boxShadow: textOverlay.backgroundColor ? '2px 2px 8px rgba(0,0,0,0.5)' : 'none',
                    maxWidth: '80%',
                    wordWrap: 'break-word',
                    fontWeight: 'bold',
                    lineHeight: '1.2'
                  }}
                >
                  {textOverlay.text}
                </div>
              );
            })}

            {/* Preview Text Overlay - Shows while typing */}
            {previewTextOverlay && (
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
                  whiteSpace: 'pre-wrap',
                  textAlign: 'center',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                  boxShadow: previewTextOverlay.backgroundColor ? '2px 2px 8px rgba(0,0,0,0.5)' : 'none',
                  maxWidth: '80%',
                  wordWrap: 'break-word',
                  fontWeight: 'bold',
                  lineHeight: '1.2',
                  border: '2px dashed #00ff00', // Green dashed border to indicate preview
                  opacity: 0.9
                }}
              >
                {previewTextOverlay.text}
              </div>
            )}
          </div>
        </div>

        {/* Video Controls Overlay - Always visible */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={togglePlayPause}
                className="text-white hover:text-purple-400 transition-colors"
                disabled={!isVideoReady}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </button>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="text-white hover:text-purple-400 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-20 accent-purple-500"
                />
              </div>
            </div>
            
            <button
              onClick={toggleFullscreen}
              className={`text-white hover:text-purple-400 transition-colors ${isFullscreen ? 'text-purple-400' : ''}`}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Click instruction */}
        {!currentZoom && isVideoReady && (
          <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm opacity-60">
            Click on video to add zoom effect
          </div>
        )}

        {/* Zoom info overlay */}
        {currentZoom && (
          <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm">
            {`Zoom: ${currentZoom.scale.toFixed(1)}x at (${currentZoom.x.toFixed(0)}%, ${currentZoom.y.toFixed(0)}%)`}
          </div>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';