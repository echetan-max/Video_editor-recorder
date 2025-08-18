import { FFmpeg } from '@ffmpeg/ffmpeg';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let loaded = false;

type ProgressHandler = (percent: number) => void;
type LogHandler = (message: string) => void;

export const isFfmpegLoaded = (): boolean => loaded;

export const getFfmpegInstance = (): FFmpeg | null => ffmpegInstance;

export const preloadFfmpeg = async (opts?: { onProgress?: ProgressHandler; onLog?: LogHandler }): Promise<FFmpeg> => {
	if (loaded && ffmpegInstance) return ffmpegInstance;
	if (loadPromise) return loadPromise;

	const instance = new FFmpeg();
	if (opts?.onLog) instance.on('log', ({ message }: { message: string }) => opts.onLog?.(message));
	if (opts?.onProgress) instance.on('progress', (p: { progress: number }) => opts.onProgress?.(Math.round((p.progress ?? 0) * 100)));

	loadPromise = instance
		.load({ coreURL: '/ffmpeg-core.js', wasmURL: '/ffmpeg-core.wasm' })
		.then(() => {
			ffmpegInstance = instance;
			loaded = true;
			return instance;
		})
		.finally(() => {
			// ensure subsequent calls can detect loaded state and not reuse stale promise
			loadPromise = null;
		});

	return loadPromise;
};

export const terminateFfmpeg = () => {
	try {
		ffmpegInstance?.terminate();
	} catch {
		// ignore
	} finally {
		ffmpegInstance = null;
		loaded = false;
		loadPromise = null;
	}
};

