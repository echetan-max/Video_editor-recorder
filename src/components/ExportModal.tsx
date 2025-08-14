import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Settings, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { ZoomEffect, TextOverlay } from '../types';
import { getExportInterpolatedZoom } from '../types';
import { VideoPlayerRef } from './VideoPlayer';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const DEBUG_EXPORT = true;
const dbg = (...args: unknown[]) => { if (DEBUG_EXPORT) console.log('[export]', ...args); };

interface ExportModalProps {
  videoFile: File;
  zoomEffects: ZoomEffect[];
  textOverlays: TextOverlay[];
  duration: number;
  onClose: () => void;
  videoPlayerRef: React.RefObject<VideoPlayerRef>;
}

interface ExportProgress {
  stage: 'initializing' | 'capturing' | 'processing' | 'encoding' | 'complete' | 'error' | 'cancelled';
  progress: number;
  message: string;
  error?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  videoFile, zoomEffects, textOverlays, duration, onClose, videoPlayerRef
}) => {
  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    stage: 'initializing', progress: 0, message: 'Initializing export...'
  });
  const [exportSettings, setExportSettings] = useState({
    quality: '1080p' as '720p' | '1080p' | '1440p' | '2160p',
    fps: 30,
    includeAudio: true,
    speedPreset: 'veryfast' as 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' // fallback only
  });
  const [showSettings, setShowSettings] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const isCancelled = useRef(false);

  useEffect(() => {
    if (!DEBUG_EXPORT) return;
    const { stage, progress, message, error } = exportProgress;
    console.log(`[export/progress] ${stage} ${progress}% - ${message}`);
    if (error) console.error('[export/error]', error);
  }, [exportProgress]);

  // FFmpeg (fallback + audio mux)
  useEffect(() => {
    isCancelled.current = false;
    const ffmpegInstance = new FFmpeg();
    (async () => {
      try {
        setExportProgress({ stage: 'initializing', progress: 10, message: 'Loading FFmpeg...' });
        ffmpegInstance.on('log', ({ message }: { message: string }) => { if (DEBUG_EXPORT) console.log('[ffmpeg]', message); });
        ffmpegInstance.on('progress', (p: { progress: number }) => {
          const percent = Math.round((p.progress ?? 0) * 100);
          setExportProgress(prev => ({ ...prev, progress: Math.max(prev.progress, percent), message: `Loading FFmpeg: ${percent}%` }));
        });
        await ffmpegInstance.load();
        setFfmpeg(ffmpegInstance);
        setIsLoaded(true);
        setExportProgress({ stage: 'initializing', progress: 100, message: 'FFmpeg loaded' });
      } catch (e) {
        console.warn('FFmpeg load failed (will still try WebCodecs):', e);
      }
    })();
    return () => {
      isCancelled.current = true;
      try {
        ffmpegInstance.terminate();
      } catch {
        // ignore
      }
    };
  }, []);

  const handleCancel = () => {
    isCancelled.current = true;
    if (ffmpeg) {
      try {
        ffmpeg.terminate();
      } catch (e) {
        console.warn('ffmpeg terminate error', e);
      }
    }
  };

  // helpers
  const pad6 = (n: number) => n.toString().padStart(6, '0');
  const pickScaleBitrate = (q: '720p'|'1080p'|'1440p'|'2160p') => {
    switch (q) {
      case '720p':  return { scale: 720,  bitrate: 4_000_000 };
      case '1080p': return { scale: 1080, bitrate: 8_000_000 };
      case '1440p': return { scale: 1440, bitrate: 12_000_000 };
      case '2160p': return { scale: 2160, bitrate: 24_000_000 };
      default:      return { scale: 1080, bitrate: 8_000_000 };
    }
  };

  const tryWebCodecsH264 = async (width: number, height: number, fps: number) => {
    if (!('VideoEncoder' in window) || !('VideoFrame' in window)) return null;
    const candidates = [
      { codec: 'avc1.640028' }, // High@L4.0
      { codec: 'avc1.4D4028' }, // Main@L4.0
      { codec: 'avc1.42E01E' }  // Baseline@L3.0
    ];
    for (const c of candidates) {
      try {
        const sup = await window.VideoEncoder.isConfigSupported({
          ...c, width, height, framerate: fps, hardwareAcceleration: 'prefer-hardware', bitrate: 8_000_000, bitrateMode: 'constant'
        });
        if (sup?.supported) return sup.config;
      } catch (e) { console.warn('Codec probe failed:', e); }
    }
    return null;
  };

  /** FAST PATH: WebCodecs → MP4 (H.264) */
  const exportWithWebCodecs = async () => {
    const fps = exportSettings.fps || 30;
    const totalFrames = Math.max(1, Math.floor(duration * fps));
    const sortedZooms = [...zoomEffects].sort((a, b) => a.startTime - b.startTime);

    // discover size
    await videoPlayerRef.current!.seekAndWait(0);
    const testCanvas = await videoPlayerRef.current!.captureFrameCanvas([], []);
    let W = testCanvas.width, H = testCanvas.height;

    const { scale, bitrate } = pickScaleBitrate(exportSettings.quality);
    if (H !== scale) {
      const ratio = W / H;
      W = Math.round(scale * ratio) & ~1;
      H = scale & ~1;
    } else { W &= ~1; H &= ~1; }

    const cfg = await tryWebCodecsH264(W, H, fps);
    if (!cfg) return null;

    dbg('WebCodecs H.264 config:', cfg);

    // muxer
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      fastStart: 'in-memory', // correct API
      video: { codec: 'avc', width: W, height: H, frameRate: fps }
    });

    // encoder
    const enc = new window.VideoEncoder({
      output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => muxer.addVideoChunk(chunk, meta),
      error: (e: Error) => { throw e; }
    });

    // realtime favors speed
    (enc as VideoEncoder).configure({
      ...cfg,
      width: W, height: H, framerate: fps,
      hardwareAcceleration: 'prefer-hardware',
      bitrate,
      bitrateMode: 'constant',
      latencyMode: 'realtime'
    });

    setExportProgress({ stage: 'capturing', progress: 0, message: 'Encoding (WebCodecs)…' });
    videoPlayerRef.current?.updateExportProgress(0, 'Encoding (WebCodecs)…');
    console.time('export.webcodecs.capture+encode');

    // optional scaler
    const scaleCanvas = (W !== testCanvas.width || H !== testCanvas.height) ? (() => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; return c;
    })() : null;
    const scaleCtx = scaleCanvas ? scaleCanvas.getContext('2d', { alpha: false })! : null;

    for (let i = 0; i < totalFrames; i++) {
      if (isCancelled.current) { dbg('webcodec capture loop cancelled'); return null; }
      const t = i / fps;
      const z = getExportInterpolatedZoom(t, sortedZooms);
      const zooms = z ? [z] : [];
      const texts = textOverlays.filter(ov => t >= ov.startTime && t <= ov.endTime);

      await videoPlayerRef.current!.seekAndWait(t);
      const c = await videoPlayerRef.current!.captureFrameCanvas(zooms, texts);

      const src = scaleCanvas ? (() => {
        scaleCtx!.clearRect(0, 0, W, H);
        scaleCtx!.drawImage(c, 0, 0, W, H);
        return scaleCanvas!;
      })() : c;

      const vf = new window.VideoFrame(src, { timestamp: Math.round(t * 1_000_000) });
      // keyframe every ~2 seconds keeps speed high
      enc.encode(vf, { keyFrame: (i % (2 * fps)) === 0 });
      vf.close();

      if (i % 10 === 0) {
        const pct = Math.round((i / totalFrames) * 90);
        setExportProgress({ stage: 'capturing', progress: pct, message: `Encoding ${i}/${totalFrames} frames…` });
        videoPlayerRef.current?.updateExportProgress(pct, `Encoding ${i}/${totalFrames}…`);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    await enc.flush();
    await muxer.finalize();
    console.timeEnd('export.webcodecs.capture+encode');

    const videoOnly = new Blob([target.buffer], { type: 'video/mp4' });

    if (!exportSettings.includeAudio || !ffmpeg || !isLoaded) {
      videoPlayerRef.current?.updateExportProgress(98, 'Finalizing…');
      return videoOnly;
    }

    if (isCancelled.current) { dbg('webcodec mux cancelled'); return null; }

    setExportProgress({ stage: 'processing', progress: 92, message: 'Muxing audio…' });
    videoPlayerRef.current?.updateExportProgress(92, 'Muxing audio…');

    const inVideoName = 'video_only.mp4';
    const ext =
      videoFile.type.includes('webm') ? 'webm' :
      videoFile.type.includes('mp4')  ? 'mp4'  :
      videoFile.type.includes('ogg')  ? 'ogg'  : 'mp4';
    const inAudioName = `input.${ext}`;

    await ffmpeg.writeFile(inVideoName, new Uint8Array(await videoOnly.arrayBuffer()));
    await ffmpeg.writeFile(inAudioName, await fetchFile(videoFile));

    const outName = 'output_muxed.mp4';
    const args = [
      '-i', inVideoName,
      '-i', inAudioName,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      outName
    ];
    dbg('ffmpeg mux args:', args.join(' '));
    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(outName);
    const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : new Blob([new Uint8Array(data)], { type: 'video/mp4' });

    videoPlayerRef.current?.updateExportProgress(98, 'Finalizing…');
    return blob;
  };

  /** Fallback: ffmpeg.wasm (JPEG sequence → x264) */
  const exportWithFFmpeg = async () => {
    if (!ffmpeg || !isLoaded) throw new Error('FFmpeg not available for fallback.');
    const fps = exportSettings.fps || 30;
    const totalFrames = Math.max(1, Math.floor(duration * fps));
    const sortedZooms = [...zoomEffects].sort((a, b) => a.startTime - b.startTime);

    const inputName = exportSettings.includeAudio
      ? (() => {
          const ext =
            videoFile.type.includes('webm') ? 'webm' :
            videoFile.type.includes('mp4')  ? 'mp4'  :
            videoFile.type.includes('ogg')  ? 'ogg'  : 'mp4';
          return `input.${ext}`;
        })()
      : null;

    if (inputName) {
      const srcData = await fetchFile(videoFile);
      await ffmpeg.writeFile(inputName, srcData);
    }

    setExportProgress({ stage: 'capturing', progress: 0, message: 'Capturing frames…' });
    videoPlayerRef.current?.updateExportProgress(0, 'Capturing frames…');

    for (let i = 0; i < totalFrames; i++) {
      if (isCancelled.current) { dbg('ffmpeg capture loop cancelled'); return null; }
      const t = i / fps;
      const z = getExportInterpolatedZoom(t, sortedZooms);
      const zooms = z ? [z] : [];
      const texts = textOverlays.filter(ov => t >= ov.startTime && t <= ov.endTime);

      await videoPlayerRef.current!.seekAndWait(t);
      const blob = await videoPlayerRef.current!.captureFrame(zooms, texts);
      const buf = new Uint8Array(await blob.arrayBuffer());
      await ffmpeg.writeFile(`frame_${pad6(i)}.jpg`, buf);

      if (i % 10 === 0) {
        const pct = Math.round((i / totalFrames) * 60);
        setExportProgress({ stage: 'capturing', progress: pct, message: `Captured ${i}/${totalFrames} frames` });
        videoPlayerRef.current?.updateExportProgress(pct, `Captured ${i}/${totalFrames}…`);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    if (isCancelled.current) { dbg('ffmpeg encode cancelled'); return null; }

    setExportProgress({ stage: 'encoding', progress: 65, message: 'Encoding MP4…' });
    videoPlayerRef.current?.updateExportProgress(70, 'Encoding MP4…');

    const qmap: Record<string, string> = {
      '720p':  'scale=-2:720',
      '1080p': 'scale=-2:1080',
      '1440p': 'scale=-2:1440',
      '2160p': 'scale=-2:2160'
    };
    const scale = qmap[exportSettings.quality] ?? qmap['1080p'];
    const out = 'output.mp4';
    const args: string[] = [
      '-framerate', String(fps),
      '-pattern_type', 'sequence',
      '-i', 'frame_%06d.jpg',
      ...(inputName ? ['-i', inputName] : []),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', exportSettings.speedPreset,
      '-crf', '23',
      '-vf', scale,
      '-movflags', '+faststart',
      ...(inputName ? ['-shortest'] : []),
      out
    ];
    dbg('ffmpeg encode args:', args.join(' '));
    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(out);
    const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : new Blob([new Uint8Array(data)], { type: 'video/mp4' });
    videoPlayerRef.current?.updateExportProgress(95, 'Finalizing…');
    return blob;
  };

  const exportVideo = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      if (!videoPlayerRef.current) {
        setExportProgress({ stage: 'error', progress: 0, message: 'VideoPlayer not available', error: 'No player ref' });
        return;
      }

      // hard stop playback + lock UI
      videoPlayerRef.current.pause();
      videoPlayerRef.current.beginExport();

      setExportProgress({ stage: 'capturing', progress: 0, message: 'Preparing…' });

      let finalBlob: Blob | null = null;
      try {
        finalBlob = await exportWithWebCodecs();
      } catch (e) {
        console.warn('WebCodecs path failed, falling back:', e);
      }
      if (!finalBlob && !isCancelled.current) finalBlob = await exportWithFFmpeg();

      if (isCancelled.current || !finalBlob) {
        videoPlayerRef.current.endExport();
        setExportProgress({ stage: 'cancelled', progress: 0, message: 'Export cancelled' });
        return;
      }

      setExportProgress({ stage: 'processing', progress: Math.max(exportProgress.progress, 98), message: 'Saving…' });
      videoPlayerRef.current.updateExportProgress(98, 'Saving…');

      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited-video-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);

      setExportProgress({ stage: 'complete', progress: 100, message: 'Export completed successfully!' });
      videoPlayerRef.current.updateExportProgress(100, 'Done');
      videoPlayerRef.current.endExport();

      setTimeout(() => onClose(), 1000);
    } catch (error) {
      if (isCancelled.current || (error instanceof Error && (error.message.includes('process exited with code') || error.message.includes('exit')))) {
         console.warn('FFmpeg process was likely cancelled.');
         videoPlayerRef.current?.endExport();
         setExportProgress({ stage: 'cancelled', progress: 0, message: 'Export cancelled' });
         return;
      }
      console.error('Export error:', error);
      videoPlayerRef.current?.endExport();
      setExportProgress({
        stage: 'error',
        progress: 0,
        message: 'Export failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const ProgressIcon = () => {
    switch (exportProgress.stage) {
      case 'complete': return <CheckCircle className="w-5 h-5" />;
      case 'error':
      case 'cancelled':
        return <AlertCircle className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  const handleCloseButton = () => {
    if (exportProgress.stage === 'capturing' || exportProgress.stage === 'processing' || exportProgress.stage === 'encoding') {
      handleCancel();
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Export Video</h2>
            <button
              onClick={handleCloseButton}
              className="text-gray-400 hover:text-white transition-colors"
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
              <p className="text-green-400 font-semibold">✓ Optimized fast export (WebCodecs when available)</p>
            </div>
          </div>

          {/* Settings */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Export Settings</h3>
              <button onClick={() => setShowSettings(!showSettings)} className="text-purple-400 hover:text-purple-300 transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </div>

            {duration > 60 && (
              <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  <span className="text-yellow-200 text-sm">
                    Long video detected ({Math.floor(duration)}s). Export time varies by hardware.
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
                    type="range" min="24" max="60" value={exportSettings.fps}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, fps: parseInt(e.target.value) }))}
                    className="w-full accent-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">Fallback Preset (ffmpeg)</label>
                  <select
                    value={exportSettings.speedPreset}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, speedPreset: e.target.value as 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2"
                  >
                    <option value="ultrafast">ultrafast (fastest)</option>
                    <option value="superfast">superfast</option>
                    <option value="veryfast">veryfast (default)</option>
                    <option value="faster">faster</option>
                    <option value="fast">fast</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox" id="includeAudio"
                    checked={exportSettings.includeAudio}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, includeAudio: e.target.checked }))}
                    className="mr-2"
                  />
                  <label htmlFor="includeAudio" className="text-sm text-gray-300">Include Audio</label>
                </div>
              </div>
            )}
          </div>

          {/* Progress */}
          {exportProgress.stage !== 'initializing' && (
            <div className="mb-6">
              <div className="flex items-center space-x-3 mb-3">
                <ProgressIcon />
                <span className={`font-medium ${exportProgress.stage === 'complete' ? 'text-green-500' : (exportProgress.stage === 'error' || exportProgress.stage === 'cancelled') ? 'text-red-500' : 'text-blue-500'}`}>
                  {exportProgress.message} <span className="ml-2 text-gray-300">{exportProgress.progress > 0 ? `${exportProgress.progress}%` : ''}</span>
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-150"
                  style={{ width: `${exportProgress.progress}%` }}
                />
              </div>
              {exportProgress.error && <p className="text-red-400 text-sm mt-2">{exportProgress.error}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-4">
            <button
              onClick={exportVideo}
              disabled={isExporting || exportProgress.stage === 'capturing' || exportProgress.stage === 'processing' || exportProgress.stage === 'encoding'}
              className="flex-1 flex items-center justify-center space-x-2 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Download className="w-5 h-5" />
              <span>
                {exportProgress.stage === 'capturing' || exportProgress.stage === 'processing' || exportProgress.stage === 'encoding'
                  ? 'Exporting...' : 'Export as MP4'}
              </span>
            </button>
            <button
              onClick={handleCloseButton}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};