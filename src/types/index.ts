export interface ZoomEffect {
  id: string;
  startTime: number;
  endTime: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  scale: number; // 1.0 to 5.0
  transition: 'smooth' | 'instant';
  type?: 'manual' | 'autozoom';
  originalData?: ClickData;
}

export interface ClicksData {
  clicks: ClickData[];
  width: number;
  height: number;
  duration?: number;
}

export interface ClickData {
  time: number;
  x: number;
  y: number;
  duration?: number;
  width?: number;
  height?: number;
  zoomLevel?: number;
  id?: string;
  timestamp?: number; // For compatibility with older formats
  type?: string;
}

export interface TextOverlay {
  id: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
}

export interface VideoProject {
  id: string;
  name: string;
  videoFile: File;
  duration: number;
  zoomEffects: ZoomEffect[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportSettings {
  quality: '720p' | '1080p' | '1440p' | '2160p';
  format: 'mp4' | 'mov' | 'avi';
  includeSakData: boolean;
}

// --- Helper: Linear interpolation ---
export function lerp(a: number, b: number, t: number) {
  // Use easeInOutCubic for a smoother transition
  const easedT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return a + (b - a) * easedT;
}

// --- Export-specific zoom interpolation with smooth transitions ---
export function getExportInterpolatedZoom(time: number, zooms: ZoomEffect[]): ZoomEffect {
  const activeZoom = getInterpolatedZoom(time, zooms);

  // If there's no specific zoom, or if it's an instant transition, return it directly
  if (activeZoom.id === 'default' || activeZoom.transition === 'instant') {
    return activeZoom;
  }

  // Apply smooth transitions to the active zoom
  const zoomDuration = activeZoom.endTime - activeZoom.startTime;
  const transitionDuration = Math.min(1.2, zoomDuration / 2.5); // 1.2s or 1/2.5 of zoom duration

  // Smooth transition in
  if (time < activeZoom.startTime + transitionDuration) {
    const t = (time - activeZoom.startTime) / transitionDuration;
    return {
      ...activeZoom,
      x: lerp(50, activeZoom.x, t),
      y: lerp(50, activeZoom.y, t),
      scale: lerp(1.0, activeZoom.scale, t),
    };
  }

  // Smooth transition out
  if (time > activeZoom.endTime - transitionDuration) {
    const t = (activeZoom.endTime - time) / transitionDuration;
    return {
      ...activeZoom,
      x: lerp(50, activeZoom.x, t),
      y: lerp(50, activeZoom.y, t),
      scale: lerp(1.0, activeZoom.scale, t),
    };
  }

  // If we are in the middle of the zoom (not in a transition period), return the zoom as is
  return activeZoom;
}

// --- Robust zoom interpolation (matches preview and export, for all zoom types) ---
export function getInterpolatedZoom(time: number, zooms: ZoomEffect[]): ZoomEffect {
  if (!zooms.length) {
    return {
      id: 'default',
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      x: 50,
      y: 50,
      scale: 1.0,
      transition: 'smooth',
    };
  }

  // Sort zooms by start time
  const sorted = [...zooms].sort((a, b) => a.startTime - b.startTime);
  
  // Before first zoom: no zoom (normal view)
  if (time < sorted[0].startTime) {
    return {
      id: 'default',
      startTime: 0,
      endTime: sorted[0].startTime,
      x: 50,
      y: 50,
      scale: 1.0,
      transition: 'smooth',
    };
  }

  // After last zoom: no zoom (normal view)
  if (time > sorted[sorted.length - 1].endTime) {
    return {
      id: 'default',
      startTime: sorted[sorted.length - 1].endTime,
      endTime: Number.MAX_SAFE_INTEGER,
      x: 50,
      y: 50,
      scale: 1.0,
      transition: 'smooth',
    };
  }

  // Find the active zoom
  for (let i = 0; i < sorted.length; i++) {
    const currentZoom = sorted[i];
    
    // If we're within this zoom's time range, return it exactly
    if (time >= currentZoom.startTime && time <= currentZoom.endTime) {
      return currentZoom;
    }
  }

  // If we're not in any zoom range, return normal view (no zoom)
  return {
    id: 'default',
    startTime: 0,
    endTime: Number.MAX_SAFE_INTEGER,
    x: 50,
    y: 50,
    scale: 1.0,
    transition: 'smooth',
  };
}