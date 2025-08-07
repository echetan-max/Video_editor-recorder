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
  // Enhanced smooth easing function for more natural transitions
  const t2 = t * t;
  const t3 = t2 * t;
  // Cubic bezier easing for smoother acceleration and deceleration
  const easedT = t3 * 4 + t2 * (-6) + t * 4;
  return a + (b - a) * easedT;
}

// --- Export-specific zoom interpolation with smooth transitions ---
export function getExportInterpolatedZoom(time: number, zooms: ZoomEffect[]): ZoomEffect {
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

  // Find the active zoom with smooth transitions for export
  for (let i = 0; i < sorted.length; i++) {
    const currentZoom = sorted[i];
    
    // If we're within this zoom's time range, handle smooth transitions
    if (time >= currentZoom.startTime && time <= currentZoom.endTime) {
      const zoomDuration = currentZoom.endTime - currentZoom.startTime;
      // Longer transition duration for smoother effect
      const transitionDuration = Math.min(1.2, zoomDuration / 2.5); // 1.2s or 1/2.5 of zoom duration
      
      // Enhanced smooth transition in
      if (time < currentZoom.startTime + transitionDuration) {
        const t = (time - currentZoom.startTime) / transitionDuration;
        return {
          ...currentZoom,
          x: lerp(50, currentZoom.x, t),
          y: lerp(50, currentZoom.y, t),
          scale: lerp(1.0, currentZoom.scale, t),
        };
      }
      
      // Enhanced smooth transition out
      if (time > currentZoom.endTime - transitionDuration) {
        const t = (currentZoom.endTime - time) / transitionDuration;
        return {
          ...currentZoom,
          x: lerp(50, currentZoom.x, t),
          y: lerp(50, currentZoom.y, t),
          scale: lerp(1.0, currentZoom.scale, t),
        };
      }
      
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