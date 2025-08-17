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
  const activeZoom = getInterpolatedZoom(time, zooms);

  // If there's no specific zoom, or if it's an instant transition, return it directly
  if (activeZoom.id === 'default' || activeZoom.transition === 'instant') {
    return activeZoom;
  }

  // Apply smooth transitions to the active zoom
  const zoomDuration = activeZoom.endTime - activeZoom.startTime;
  const transitionDuration = Math.min(1.2, zoomDuration / 2.5); // 1.2s or 1/2.5 of zoom duration

  // Get the previous zoom state for smooth transition
  const getPreviousZoomState = (currentTime: number): { x: number, y: number, scale: number } => {
    // Find the zoom state just before this one
    const sortedZooms = [...zooms].sort((a, b) => a.startTime - b.startTime);
    const currentZoomIndex = sortedZooms.findIndex(z => z.id === activeZoom.id);
    
    if (currentZoomIndex > 0) {
      const prevZoom = sortedZooms[currentZoomIndex - 1];
      if (currentTime <= prevZoom.endTime + 0.1) { // Small buffer for smooth transition
        return { x: prevZoom.x, y: prevZoom.y, scale: prevZoom.scale };
      }
    }
    
    // If no previous zoom or gap between zooms, return default center state
    return { x: 50, y: 50, scale: 1.0 };
  };

  // Get the next zoom state for smooth transition out
  const getNextZoomState = (currentTime: number): { x: number, y: number, scale: number } => {
    // Find the zoom state just after this one
    const sortedZooms = [...zooms].sort((a, b) => a.startTime - b.startTime);
    const currentZoomIndex = sortedZooms.findIndex(z => z.id === activeZoom.id);
    
    if (currentZoomIndex < sortedZooms.length - 1) {
      const nextZoom = sortedZooms[currentZoomIndex + 1];
      if (currentTime >= nextZoom.startTime - 0.1) { // Small buffer for smooth transition
        return { x: nextZoom.x, y: nextZoom.y, scale: nextZoom.scale };
      }
    }
    
    // If no next zoom or gap between zooms, return default center state
    return { x: 50, y: 50, scale: 1.0 };
  };

  // Smooth transition in
  if (time < activeZoom.startTime + transitionDuration) {
    const t = Math.max(0, Math.min(1, (time - activeZoom.startTime) / transitionDuration));
    const prevState = getPreviousZoomState(time);
    
    return {
      ...activeZoom,
      x: lerp(prevState.x, activeZoom.x, t),
      y: lerp(prevState.y, activeZoom.y, t),
      scale: lerp(prevState.scale, activeZoom.scale, t),
    };
  }

  // Smooth transition out
  if (time > activeZoom.endTime - transitionDuration) {
    const t = Math.max(0, Math.min(1, (activeZoom.endTime - time) / transitionDuration));
    const nextState = getNextZoomState(time);
    
    return {
      ...activeZoom,
      x: lerp(nextState.x, activeZoom.x, t),
      y: lerp(nextState.y, activeZoom.y, t),
      scale: lerp(nextState.scale, activeZoom.scale, t),
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