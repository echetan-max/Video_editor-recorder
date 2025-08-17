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
  // Use LINEAR interpolation for direct, straight-line transitions (no curves)
  return a + (b - a) * t;
}

// --- Export-specific zoom interpolation - EXACTLY matches preview smooth transitions ---
export function getExportInterpolatedZoom(time: number, zooms: ZoomEffect[]): ZoomEffect | null {
  if (!zooms.length) {
    return null; // No zoom effects
  }

  // Use the EXACT SAME logic as the preview for perfect sync
  const sorted = [...zooms].sort((a, b) => a.startTime - b.startTime);
  
  // Before first zoom: no zoom (normal view)
  if (time < sorted[0].startTime) {
    return null; // No zoom effect
  }

  // After last zoom: no zoom (normal view)
  if (time > sorted[sorted.length - 1].endTime) {
    return null; // No zoom effect
  }

  // Find the active zoom for this exact time
  for (let i = 0; i < sorted.length; i++) {
    const zoom = sorted[i];
    
    // If we're within this zoom's time range, apply smooth transitions
    if (time >= zoom.startTime && time <= zoom.endTime) {
      const zoomDuration = zoom.endTime - zoom.startTime;
      const transitionDuration = 0.4; // Same as CSS transition duration
      
      // Smooth transition IN (first 0.4s of zoom)
      if (time < zoom.startTime + transitionDuration) {
        const t = (time - zoom.startTime) / transitionDuration;
        // Use cubic-bezier easing (same as CSS)
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        return {
          ...zoom,
          x: lerp(50, zoom.x, easedT),
          y: lerp(50, zoom.y, easedT),
          scale: lerp(1.0, zoom.scale, easedT),
        };
      }
      
      // Smooth transition OUT (last 0.4s of zoom)
      if (time > zoom.endTime - transitionDuration) {
        const t = (zoom.endTime - time) / transitionDuration;
        // Use cubic-bezier easing (same as CSS)
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        return {
          ...zoom,
          x: lerp(50, zoom.x, easedT),
          y: lerp(50, zoom.y, easedT),
          scale: lerp(1.0, zoom.scale, easedT),
        };
      }
      
      // Middle of zoom (no transition, full zoom)
      return zoom;
    }
  }

  // No zoom active at this time
  return null;
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