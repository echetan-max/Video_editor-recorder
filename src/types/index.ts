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
  
  // Add a small transition buffer for smooth zoom out
  const transitionBuffer = 0.3; // 300ms buffer for zoom out
  
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

  // Find the active zoom or handle zoom out transition
  for (let i = 0; i < sorted.length; i++) {
    const currentZoom = sorted[i];
    
    // If we're within this zoom's time range, return it exactly
    if (time >= currentZoom.startTime && time <= currentZoom.endTime) {
      return currentZoom;
    }
    
    // Handle zoom out transition - small buffer after zoom ends
    if (time > currentZoom.endTime && time <= currentZoom.endTime + transitionBuffer) {
      const progress = (time - currentZoom.endTime) / transitionBuffer;
      const t = Math.max(0, Math.min(1, progress));
      
      // Smoothly transition from zoom point to center
      return {
        id: `zoom-out-${currentZoom.id}`,
        startTime: currentZoom.endTime,
        endTime: currentZoom.endTime + transitionBuffer,
        x: lerp(currentZoom.x, 50, t),
        y: lerp(currentZoom.y, 50, t),
        scale: lerp(currentZoom.scale, 1.0, t),
        transition: currentZoom.transition,
      };
    }
  }

  // After all zooms: no zoom (normal view)
  const lastZoom = sorted[sorted.length - 1];
  if (time > lastZoom.endTime + transitionBuffer) {
    return {
      id: 'default',
      startTime: lastZoom.endTime + transitionBuffer,
      endTime: Number.MAX_SAFE_INTEGER,
      x: 50,
      y: 50,
      scale: 1.0,
      transition: 'smooth',
    };
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