import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VideoPlayer, VideoPlayerRef } from './VideoPlayer';
import { Timeline } from './Timeline';
import { ZoomControls } from './ZoomControls';
import { Header } from './Header';
import { FileImport } from './FileImport';
import { ExportModal } from './ExportModal';
import { TextOverlayComponent } from './TextOverlay';
import { ZoomEffect, TextOverlay, getInterpolatedZoom, ClicksData } from '../types';


export const VideoEditor: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [selectedZoom, setSelectedZoom] = useState<ZoomEffect | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [previewTextOverlay, setPreviewTextOverlay] = useState<TextOverlay | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  

  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [ffmpegStatus, setFfmpegStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const videoRef = useRef<VideoPlayerRef>(null);

  // Define deleteZoomEffect before using it
  const deleteZoomEffect = useCallback((id: string) => {
    setZoomEffects((prev: ZoomEffect[]) => prev.filter(zoom => zoom.id !== id));
    if (selectedZoom?.id === id) {
      setSelectedZoom(null);
    }
  }, [selectedZoom]);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [videoFile]);

  const checkFfmpegFiles = useCallback(async () => {
    setFfmpegStatus('loading');
    try {
      const [jsRes, wasmRes] = await Promise.all([
        fetch('/ffmpeg-core.js'),
        fetch('/ffmpeg-core.wasm')
      ]);
      if (jsRes.ok && wasmRes.ok) {
        setFfmpegStatus('loaded');
      } else {
        throw new Error('FFmpeg core files not found on server.');
      }
    } catch (e) {
      console.error("FFmpeg check failed:", e);
      setFfmpegStatus('error');
    }
  }, []);

  useEffect(() => {
    checkFfmpegFiles();
  }, [checkFfmpegFiles]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedZoom) {
        deleteZoomEffect(selectedZoom.id);
      }
      if (e.key === 'Escape') {
        setSelectedZoom(null);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedZoom, deleteZoomEffect]);

  const addZoomEffect = (startTime: number, endTime: number, x: number, y: number, scale: number, type: 'manual' | 'autozoom' = 'manual') => {
    const newZoom: ZoomEffect = {
      id: crypto.randomUUID(),
      startTime,
      endTime,
      x,
      y,
      scale,
      transition: 'smooth',
      type
    };
    setZoomEffects(prev => [...prev, newZoom]);
    setSelectedZoom(newZoom);
  };

  const updateZoomEffect = (updatedZoom: ZoomEffect) => {
    setZoomEffects(prev => 
      prev.map(zoom => zoom.id === updatedZoom.id ? updatedZoom : zoom)
    );
    setSelectedZoom(updatedZoom);
  };

  // Text overlay functions
  const addTextOverlay = (textOverlay: TextOverlay) => {
    setTextOverlays(prev => [...prev, textOverlay]);
    setPreviewTextOverlay(null); // Clear preview when text is added
  };

  const updateTextOverlay = (id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays(prev => 
      prev.map(text => text.id === id ? { ...text, ...updates } : text)
    );
  };

  const deleteTextOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(text => text.id !== id));
  };

  const setPreviewText = (preview: TextOverlay | null) => {
    setPreviewTextOverlay(preview);
  };



  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    videoRef.current?.seek(time);
  };

  const handlePlay = () => {
    setIsPlaying(true);
    videoRef.current?.play();
  };

  const handlePause = () => {
    setIsPlaying(false);
    videoRef.current?.pause();
  };




  const handleClicksImport = (clicksData: ClicksData) => {
    if (clicksData.clicks && Array.isArray(clicksData.clicks)) {
      const newZoomEffects: ZoomEffect[] = clicksData.clicks.map((click) => {
        const startTime = click.time || click.timestamp || 0;
        const endTime = startTime + (click.duration || 2.0);
        const width = click.width || clicksData.width;
        const height = click.height || clicksData.height;

        return {
          id: crypto.randomUUID(),
          startTime: startTime,
          endTime: endTime,
          x: (click.x / width) * 100,
          y: (click.y / height) * 100,
          scale: click.zoomLevel || 2.0,
          transition: 'smooth',
          type: 'autozoom' as const,
          originalData: click,
        };
      });

      setZoomEffects(prev => [...prev, ...newZoomEffects]);
    }
  };

  const resetProject = () => {
    setVideoFile(null);
    setZoomEffects([]);
    setSelectedZoom(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setTextOverlays([]); // Clear text overlays as well
  };


  // Utility to get export-ready zooms (sorted, filtered)
  function getExportReadyZooms(zooms: ZoomEffect[], duration: number): ZoomEffect[] {
    return [...zooms]
      .filter(z => z.startTime < duration && z.endTime > 0)
      .map(z => ({
        ...z,
        startTime: Math.max(0, Math.min(z.startTime, duration)),
        endTime: Math.max(0, Math.min(z.endTime, duration)),
      }))
      .sort((a, b) => a.startTime - b.startTime);
  }

  if (!videoFile) {
    return (
      <div>
        <FileImport
          onFileSelect={setVideoFile}
          onClicksImport={handleClicksImport}
          ffmpegStatus={ffmpegStatus}
          onFfmpegCheck={checkFfmpegFiles}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {ffmpegStatus === 'error' && (
        <div className="bg-red-800 text-white text-center p-2 text-sm">
          Warning: Could not load FFmpeg components. Audio mixing and fallback video export may not work.
        </div>
       )}
      <Header
        videoFile={videoFile}
        onExport={() => setShowExportModal(true)}
        onNewProject={resetProject}
        onClicksImport={handleClicksImport}
        onScreenrecorder={() => window.open('set.html', '_blank')}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
          {/* Removed tab buttons for Zoom Effects and Text Overlays */}
          <div className="flex-1 overflow-y-auto">
            <ZoomControls
              zoomEnabled={zoomEnabled}
              onToggleZoom={setZoomEnabled}
              selectedZoom={selectedZoom}
              onUpdateZoom={updateZoomEffect}
              onDeleteZoom={deleteZoomEffect}
              onAddZoom={() => {
                const startTime = currentTime;
                const endTime = Math.min(currentTime + 2.0, duration);
                addZoomEffect(startTime, endTime, 50, 50, 2.0);
              }}
              duration={duration}
            />
            
            <TextOverlayComponent
              textOverlays={textOverlays}
              onAddText={addTextOverlay}
              onUpdateText={updateTextOverlay}
              onDeleteText={deleteTextOverlay}
              currentTime={currentTime}
              duration={duration}
              setPreviewText={setPreviewText}
            />
          </div>
        </div>
        
        <div className="flex-1 flex flex-col">
          <VideoPlayer
            ref={videoRef}
            src={videoUrl}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={(duration) => setDuration(duration)}
            onPlay={handlePlay}
            onPause={handlePause}
            currentZoom={(() => {
              const sortedZooms = [...zoomEffects].sort((a, b) => a.startTime - b.startTime);
              const interpolatedZoom = getInterpolatedZoom(currentTime, sortedZooms);
              
              // Always return the interpolated zoom, even if it's the default zoom-out
              // This ensures the preview shows the correct zoom state at all times
              return interpolatedZoom;
            })()}
            textOverlays={textOverlays}
            previewTextOverlay={previewTextOverlay}
            onVideoClick={(x, y) => {
              if (zoomEnabled && !selectedZoom) {
                const startTime = currentTime;
                const endTime = Math.min(currentTime + 2.0, duration);
                addZoomEffect(startTime, endTime, x, y, 2.0);
              }
            }}
          />
          <Timeline
            duration={duration}
            currentTime={currentTime}
            onSeek={handleSeek}
            zoomEffects={getExportReadyZooms(zoomEffects, duration)}
            selectedZoom={selectedZoom}
            onSelectZoom={setSelectedZoom}
            onUpdateZoom={updateZoomEffect}
            onDeleteZoom={deleteZoomEffect}
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
          />
        </div>
      </div>

      {showExportModal && (
        <ExportModal
          videoFile={videoFile}
          zoomEffects={getExportReadyZooms(zoomEffects, duration)}
          textOverlays={textOverlays}
          duration={duration}
          onClose={() => setShowExportModal(false)}
          videoPlayerRef={videoRef}
        />
      )}


    </div>
  );
};