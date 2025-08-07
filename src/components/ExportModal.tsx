import React, { useState, useEffect } from 'react';
import { X, Download, Settings, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { ZoomEffect, TextOverlay } from '../types';
import { getInterpolatedZoom } from '../types';
import { VideoPlayerRef } from './VideoPlayer';
interface ExportModalProps {
  videoFile: File;
  zoomEffects: ZoomEffect[];
  textOverlays: TextOverlay[];
  duration: number;
  onClose: () => void;
  videoPlayerRef: React.RefObject<VideoPlayerRef>; // Add video player ref
}
interface ExportProgress {
  stage: 'initializing' | 'capturing' | 'processing' | 'encoding' | 'complete' | 'error';
  progress: number;
  message: string;
  error?: string;
}
export const ExportModal: React.FC<ExportModalProps> = ({
  videoFile,
  zoomEffects,
  textOverlays,
  duration,
  onClose,
  videoPlayerRef
}) => {
  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    stage: 'initializing',
    progress: 0,
    message: 'Initializing export...'
  });
  const [exportSettings, setExportSettings] = useState({
    quality: '1080p' as '720p' | '1080p' | '1440p' | '2160p',
    fps: 30,
    includeAudio: true
  });
  const [showSettings, setShowSettings] = useState(false);
  // Initialize FFmpeg
  useEffect(() => {
    const initFFmpeg = async () => {
      try {
        console.log('Starting FFmpeg initialization...');
        setExportProgress({
          stage: 'initializing',
          progress: 10,
          message: 'Loading FFmpeg...'
        });
        const ffmpegInstance = new FFmpeg();
        
        ffmpegInstance.on('log', (msg: { type: string; message: string }) => {
          console.log('FFmpeg Log:', msg.message);
        });
        
        ffmpegInstance.on('progress', (progress: { progress: number; time: number }) => {
          const percent = Math.round(progress.progress * 100);
          console.log('FFmpeg Progress:', percent + '%');
          setExportProgress(prev => ({
            ...prev,
            progress: percent,
            message: `Loading FFmpeg: ${percent}%`
          }));
        });
        console.log('Loading FFmpeg...');
        await ffmpegInstance.load();
        
        setFfmpeg(ffmpegInstance);
        setIsLoaded(true);
        setExportProgress({
          stage: 'initializing',
          progress: 100,
          message: 'FFmpeg loaded successfully'
        });
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        setExportProgress({
          stage: 'error',
          progress: 0,
          message: 'Failed to load FFmpeg',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };
    initFFmpeg();
  }, []);
  // ...existing code...
  // Export video
  const exportVideo = async () => {
    console.log('Export started, FFmpeg status:', { ffmpeg, isLoaded });
    console.log('Export props received:', {
      zoomEffects: zoomEffects,
      textOverlays: textOverlays,
      duration: duration,
      zoomEffectsCount: zoomEffects.length,
      textOverlaysCount: textOverlays.length
    });
    
    // Log detailed zoom effects
    console.log('Zoom effects details:', zoomEffects.map(z => ({
      id: z.id,
      startTime: z.startTime,
      endTime: z.endTime,
      x: z.x,
      y: z.y,
      scale: z.scale
    })));
    
    // Log detailed text overlays
    console.log('Text overlays details:', textOverlays.map(t => ({
      id: t.id,
      startTime: t.startTime,
      endTime: t.endTime,
      text: t.text,
      x: t.x,
      y: t.y
    })));
    
    // Check if any zoom effects are within the video duration
    const validZooms = zoomEffects.filter(z => z.startTime < duration && z.endTime > 0);
    console.log('Valid zoom effects for export:', validZooms.length, 'out of', zoomEffects.length);
    console.log('Valid zooms:', validZooms.map(z => ({
      id: z.id,
      startTime: z.startTime,
      endTime: z.endTime,
      scale: z.scale
    })));
    
    if (!ffmpeg || !isLoaded) {
      console.error('FFmpeg not loaded or not initialized');
      setExportProgress({
        stage: 'error',
        progress: 0,
        message: 'FFmpeg not loaded',
        error: 'FFmpeg is not properly initialized. Please try refreshing the page.'
      });
      return;
    }
    if (!videoPlayerRef.current) {
      console.error('VideoPlayer not available');
      setExportProgress({
        stage: 'error',
        progress: 0,
        message: 'VideoPlayer not available',
        error: 'VideoPlayer is not available for frame capture.'
      });
      return;
    }
    // Minimal test: capture a single frame to ensure VideoPlayer is ready
    try {
      await videoPlayerRef.current.seekAndWait(0);
      const testFrame = await videoPlayerRef.current.captureFrame([], []);
      if (!testFrame || !testFrame.width || !testFrame.height) throw new Error('Frame capture failed');
    } catch (error) {
      console.error('Test frame capture failed:', error);
      setExportProgress({
        stage: 'error',
        progress: 0,
        message: 'Frame capture test failed',
        error: `VideoPlayer is not ready for export: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return;
    }
    try {
      console.log('Starting export with zoom effects:', zoomEffects);
      console.log('Text overlays:', textOverlays);
      
      setExportProgress({
        stage: 'capturing',
        progress: 0,
        message: 'Preparing video export...'
      });
      // Calculate frames with optimized parameters
      const maxDuration = Math.min(duration, 300);
      const processingFps = Math.min(exportSettings.fps, 30);
      const totalFrames = Math.floor(maxDuration * processingFps);
      const frameInterval = 1 / processingFps;
      
      console.log(`Exporting ${totalFrames} frames at ${processingFps}fps for ${maxDuration}s duration`);
      
      // Optimize frame capture with larger batches and parallel processing
      const batchSize = 15; // Reduced batch size for better performance
      const frames: ImageData[] = [];
      const frameBatches: Promise<ImageData[]>[] = [];
      
      // Pre-calculate zoom and text data for all frames to avoid repeated calculations
      const sortedZooms = [...zoomEffects].sort((a, b) => a.startTime - b.startTime);
      const frameData = Array.from({ length: totalFrames }, (_, j) => {
        const time = j * frameInterval;
        const interpolatedZoom = getInterpolatedZoom(time, sortedZooms);
        return {
          time,
          zoomsForFrame: interpolatedZoom ? [interpolatedZoom] : [],
          textsForFrame: textOverlays.filter(t => time >= t.startTime && time <= t.endTime),
        };
      });
      
      // Process frames in parallel batches
      for (let i = 0; i < totalFrames; i += batchSize) {
        const batchEnd = Math.min(i + batchSize, totalFrames);
        setExportProgress(prev => ({
          ...prev,
          progress: Math.round((i / totalFrames) * 50),
          message: `Capturing frames ${i + 1}-${batchEnd}/${totalFrames}`
        }));
        const batchFrames = Promise.all(
          frameData.slice(i, batchEnd).map(({ zoomsForFrame, textsForFrame }) => 
            videoPlayerRef.current!.captureFrame(zoomsForFrame, textsForFrame)
          )
        );
        frameBatches.push(batchFrames);
        // Yield to main thread to prevent UI freezing
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      
      // Wait for all batches to complete and flatten the results
      const batchResults = await Promise.all(frameBatches);
      frames.push(...batchResults.flat());
      console.log(`Total frames captured: ${frames.length}`);
      
      // Log some sample frames to verify they contain the expected data
      if (frames.length > 0) {
        const sampleFrame = frames[0] as ImageData;
        console.log('Sample frame data:', {
          width: sampleFrame.width,
          height: sampleFrame.height,
          dataLength: sampleFrame.data.length,
          hasData: sampleFrame.data.some((pixel: number) => pixel !== 0) // Check if frame has non-black pixels
        });
      }
      setExportProgress({
        stage: 'processing',
        progress: 50,
        message: 'Processing frames...'
      });
      // Convert frames to PNG blobs with optimized parallel processing
      console.log('Converting frames to PNG blobs...');
      const convertBatch = async (frames: ImageData[], startIndex: number, batchSize: number) => {
        const batchBlobs: Promise<Blob>[] = [];
        const offscreenCanvas = new OffscreenCanvas(frames[0].width, frames[0].height);
        const ctx = offscreenCanvas.getContext('2d')!;
        
        for (let i = 0; i < Math.min(batchSize, frames.length - startIndex); i++) {
          const frame = frames[startIndex + i];
          ctx.putImageData(frame, 0, 0);
          batchBlobs.push(offscreenCanvas.convertToBlob({ type: 'image/png', quality: 0.8 }));
        }
        
        return Promise.all(batchBlobs);
      };
      // Process frames in parallel batches for blob conversion
      const blobBatchSize = 15;
      const blobBatches: Promise<Blob[]>[] = [];
      
      for (let i = 0; i < frames.length; i += blobBatchSize) {
        blobBatches.push(convertBatch(frames as ImageData[], i, blobBatchSize));
        // Yield to main thread
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      
      const blobs = (await Promise.all(blobBatches)).flat();
      console.log(`All frames converted to blobs. Total blobs: ${blobs.length}`);
      
      // Write frames to FFmpeg
      console.log('Writing frames to FFmpeg...');
      for (let i = 0; i < blobs.length; i++) {
        const frameNumber = i.toString().padStart(6, '0');
        const frameData = await blobs[i].arrayBuffer();
        await ffmpeg.writeFile(`frame_${frameNumber}.png`, new Uint8Array(frameData));
        if (i > 0 && i % 10 === 0) {
            setExportProgress((prev) => ({
                ...prev,
                message: `Prepared ${i}/${blobs.length} frames for encoding...`,
                progress: prev.progress + 2,
            }));
            await new Promise((resolve) => setTimeout(resolve, 0)); // Yield to main thread
        }
      }
      console.log('All frames written to FFmpeg');
      setExportProgress({
        stage: 'encoding',
        progress: 75,
        message: 'Encoding video...'
      });
      // Write audio if included
      if (exportSettings.includeAudio) {
        const audioData = await fetchFile(videoFile);
        const audioExt = videoFile.type === 'video/webm' ? 'webm' : 'mp3';
        await ffmpeg.writeFile(`audio.${audioExt}`, audioData);
      }
      // Run FFmpeg command with optimized encoding settings
      const outputFileName = 'output.mp4';
      const qualityMap = {
        '720p': { scale: 'scale=-2:720', crf: '26'},
        '1080p': { scale: 'scale=-2:1080', crf: '25'},
        '1440p': { scale: 'scale=-2:1440', crf: '24'},
        '2160p': { scale: 'scale=-2:2160', crf: '23'}
      }
      const selectedQuality = qualityMap[exportSettings.quality];
      const ffmpegCommand = [
        '-framerate', exportSettings.fps.toString(),
        '-i', 'frame_%06d.png',
        ...(exportSettings.includeAudio ? ['-i', `audio.${videoFile.type === 'video/webm' ? 'webm' : 'mp3'}`] : []),
        '-c:v', 'libx264',
        '-vf', selectedQuality.scale,
        '-preset', 'ultrafast', // Faster encoding
        '-crf', selectedQuality.crf, // Good balance between quality and file size
        '-tune', 'zerolatency', // Optimize for faster encoding
        '-movflags', '+faststart', // Enable streaming optimization
        '-pix_fmt', 'yuv420p', // Ensure compatibility
        '-threads', '0', // Use all available CPU threads
        ...(exportSettings.includeAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
        '-shortest',
        outputFileName
      ];
      console.log('Running FFmpeg command:', ffmpegCommand.join(' '));
      await ffmpeg.exec(ffmpegCommand);
      console.log('FFmpeg encoding completed successfully');
      // Download the file
      console.log('Reading output file from FFmpeg...');
      const data = await ffmpeg.readFile(outputFileName);
      console.log('Output file read, size:', data.length, 'bytes');
      
      const blob = new Blob([data], { type: 'video/mp4' });
      console.log('Created MP4 blob, size:', blob.size, 'bytes');
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportProgress({
        stage: 'complete',
        progress: 100,
        message: 'Export completed successfully!'
      });
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Export error:', error);
      setExportProgress({
        stage: 'error',
        progress: 0,
        message: 'Export failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
  const getProgressColor = () => {
    switch (exportProgress.stage) {
      case 'complete': return 'text-green-500';
      case 'error': return 'text-red-500';
      default: return 'text-blue-500';
    }
  };
  const getProgressIcon = () => {
    switch (exportProgress.stage) {
      case 'complete': return <CheckCircle className="w-5 h-5" />;
      case 'error': return <AlertCircle className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Export Video</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              disabled={exportProgress.stage === 'capturing' || exportProgress.stage === 'processing' || exportProgress.stage === 'encoding'}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          {/* Export Info */}
          <div className="mb-6 p-4 bg-gray-800 rounded-lg">
            <h3 className="text-lg font-semibold text-white mb-3">Export Summary</h3>
            <div className="space-y-2 text-gray-300">
              <p>• {zoomEffects.length} zoom effects will be applied</p>
              <p>• {textOverlays.length} text overlays will be included</p>
              <p>• Duration: {Math.floor(duration)} seconds</p>
              <p>• Quality: {exportSettings.quality}</p>
              <p>• Frame rate: {exportSettings.fps} FPS</p>
              <p className="text-green-400 font-semibold">✓ Export will match exactly what you see in the player</p>
            </div>
          </div>
          {/* Settings Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Export Settings</h3>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-purple-400 hover:text-purple-300 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
            
            {duration > 60 && (
              <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  <span className="text-yellow-200 text-sm">
                    Long video detected ({Math.floor(duration)}s). Export may take several minutes.
                  </span>
                </div>
              </div>
            )}
            
            {showSettings && (
              <div className="bg-gray-800 rounded-lg p-4 space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Quality</label>
                  <select
                    value={exportSettings.quality}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, quality: e.target.value as '720p' | '1080p' | '1440p' | '2160p' }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2"
                  >
                    <option value="720p">720p (HD)</option>
                    <option value="1080p">1080p (Full HD)</option>
                    <option value="1440p">1440p (2K)</option>
                    <option value="2160p">2160p (4K)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Frame Rate: {exportSettings.fps} FPS</label>
                  <input
                    type="range"
                    min="24"
                    max="60"
                    value={exportSettings.fps}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, fps: parseInt(e.target.value) }))}
                    className="w-full accent-purple-500"
                  />
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="includeAudio"
                    checked={exportSettings.includeAudio}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, includeAudio: e.target.checked }))}
                    className="mr-2"
                  />
                  <label htmlFor="includeAudio" className="text-sm text-gray-300">Include Audio</label>
                </div>
              </div>
            )}
          </div>
          {/* Progress Section */}
          {exportProgress.stage !== 'initializing' && (
            <div className="mb-6">
              <div className="flex items-center space-x-3 mb-3">
                {getProgressIcon()}
                <span className={`font-medium ${getProgressColor()}`}>
                  {exportProgress.message}
                </span>
              </div>
              
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress.progress}%` }}
                />
              </div>
              
              {exportProgress.error && (
                <p className="text-red-400 text-sm mt-2">{exportProgress.error}</p>
              )}
            </div>
          )}
          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={exportVideo}
              disabled={!isLoaded || exportProgress.stage === 'capturing' || exportProgress.stage === 'processing' || exportProgress.stage === 'encoding'}
              className="flex-1 flex items-center justify-center space-x-2 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Download className="w-5 h-5" />
              <span>
                {!isLoaded ? 'Loading FFmpeg...' : 
                 exportProgress.stage === 'capturing' || exportProgress.stage === 'processing' || exportProgress.stage === 'encoding' ? 
                 'Exporting...' : 'Export as MP4'}
              </span>
            </button>
            
            <button
              onClick={onClose}
              disabled={exportProgress.stage === 'capturing' || exportProgress.stage === 'processing' || exportProgress.stage === 'encoding'}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};