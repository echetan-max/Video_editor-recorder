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
  // Use linear interpolation for direct, smooth transitions
  return a + (b - a) * t;
}

// --- Export-specific zoom interpolation with smooth transitions ---
export function getExportInterpolatedZoom(time: number, zooms: ZoomEffect[]): ZoomEffect {
  // For export, use the same logic as preview to ensure consistency
  return getInterpolatedZoom(time, zooms);
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
  
  // Define transition duration for smooth zoom out
  const transitionDuration = 0.5; // 0.5 seconds for zoom out transition
  
  // Before first zoom: check if we're in a zoom-in transition
  if (time < sorted[0].startTime) {
    // If we're close to the first zoom, start transitioning to it
    if (time >= sorted[0].startTime - transitionDuration) {
      const progress = (time - (sorted[0].startTime - transitionDuration)) / transitionDuration;
      const t = Math.max(0, Math.min(1, progress));
      
      return {
        id: `transition-to-${sorted[0].id}`,
        startTime: sorted[0].startTime - transitionDuration,
        endTime: sorted[0].startTime,
        x: lerp(50, sorted[0].x, t),
        y: lerp(50, sorted[0].y, t),
        scale: lerp(1.0, sorted[0].scale, t),
        transition: sorted[0].transition,
      };
    }
    
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

  // After last zoom: check if we're in a zoom-out transition
  const lastZoom = sorted[sorted.length - 1];
  if (time > lastZoom.endTime) {
    // If we're close to the end of the last zoom, start transitioning out
    if (time <= lastZoom.endTime + transitionDuration) {
      const progress = (time - lastZoom.endTime) / transitionDuration;
      const t = Math.max(0, Math.min(1, progress));
      
      return {
        id: `transition-from-${lastZoom.id}`,
        startTime: lastZoom.endTime,
        endTime: lastZoom.endTime + transitionDuration,
        x: lerp(lastZoom.x, 50, t),
        y: lerp(lastZoom.y, 50, t),
        scale: lerp(lastZoom.scale, 1.0, t),
        transition: lastZoom.transition,
      };
    }
    
    return {
      id: 'default',
      startTime: lastZoom.endTime + transitionDuration,
      endTime: Number.MAX_SAFE_INTEGER,
      x: 50,
      y: 50,
      scale: 1.0,
      transition: 'smooth',
    };
  }

  // Find the active zoom or transition between zooms
  for (let i = 0; i < sorted.length; i++) {
    const currentZoom = sorted[i];
    
    // If we're within this zoom's time range, return it exactly
    if (time >= currentZoom.startTime && time <= currentZoom.endTime) {
      return currentZoom;
    }
    
    // Check if we're in a transition zone after this zoom
    if (time > currentZoom.endTime && time <= currentZoom.endTime + transitionDuration) {
      const nextZoom = sorted[i + 1];
      
      if (nextZoom && time < nextZoom.startTime - transitionDuration) {
        // Transition from current zoom to default (zoom out)
        const progress = (time - currentZoom.endTime) / transitionDuration;
        const t = Math.max(0, Math.min(1, progress));
        
        return {
          id: `transition-from-${currentZoom.id}`,
          startTime: currentZoom.endTime,
          endTime: currentZoom.endTime + transitionDuration,
          x: lerp(currentZoom.x, 50, t),
          y: lerp(currentZoom.y, 50, t),
          scale: lerp(currentZoom.scale, 1.0, t),
          transition: currentZoom.transition,
        };
      } else if (nextZoom) {
        // Transition from current zoom to next zoom
        const totalTransitionTime = nextZoom.startTime - currentZoom.endTime;
        const progress = (time - currentZoom.endTime) / totalTransitionTime;
        const t = Math.max(0, Math.min(1, progress));
        
        return {
          id: `transition-${currentZoom.id}-to-${nextZoom.id}`,
          startTime: currentZoom.endTime,
          endTime: nextZoom.startTime,
          x: lerp(currentZoom.x, nextZoom.x, t),
          y: lerp(currentZoom.y, nextZoom.y, t),
          scale: lerp(currentZoom.scale, nextZoom.scale, t),
          transition: nextZoom.transition,
        };
      }
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