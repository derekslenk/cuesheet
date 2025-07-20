// Performance utilities and hooks for optimization

import React, { useMemo, useCallback, useRef } from 'react';

// Debounce hook for preventing excessive API calls
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]) as T;
}

// Throttle hook for limiting function calls
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef<number>(0);

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCallRef.current >= delay) {
      lastCallRef.current = now;
      callback(...args);
    }
  }, [callback, delay]) as T;
}

// Memoized stream lookup utilities
export function createStreamLookupMaps(streams: Array<{ id: number; obs_source_name: string; name: string }>) {
  return useMemo(() => {
    const sourceToIdMap = new Map<string, number>();
    const idToStreamMap = new Map<number, { id: number; obs_source_name: string; name: string }>();
    
    streams.forEach(stream => {
      sourceToIdMap.set(stream.obs_source_name, stream.id);
      idToStreamMap.set(stream.id, stream);
    });
    
    return { sourceToIdMap, idToStreamMap };
  }, [streams]);
}

// Efficient active source lookup
export function useActiveSourceLookup(
  streams: Array<{ id: number; obs_source_name: string; name: string }>,
  activeSources: Record<string, string | null>
) {
  const { sourceToIdMap } = createStreamLookupMaps(streams);
  
  return useMemo(() => {
    const activeSourceIds: Record<string, number | null> = {};
    
    Object.entries(activeSources).forEach(([screen, sourceName]) => {
      activeSourceIds[screen] = sourceName ? sourceToIdMap.get(sourceName) || null : null;
    });
    
    return activeSourceIds;
  }, [activeSources, sourceToIdMap]);
}

// Performance monitoring utilities
export class PerformanceMonitor {
  private static metrics: Map<string, number[]> = new Map();
  
  static startTimer(label: string): () => void {
    const start = performance.now();
    
    return () => {
      const duration = performance.now() - start;
      
      if (!this.metrics.has(label)) {
        this.metrics.set(label, []);
      }
      
      this.metrics.get(label)!.push(duration);
      
      // Keep only last 100 measurements
      if (this.metrics.get(label)!.length > 100) {
        this.metrics.get(label)!.shift();
      }
    };
  }
  
  static getMetrics(label: string) {
    const measurements = this.metrics.get(label) || [];
    if (measurements.length === 0) return null;
    
    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);
    
    return { avg, min, max, count: measurements.length };
  }
  
  static getAllMetrics() {
    const result: Record<string, any> = {};
    this.metrics.forEach((_, label) => {
      result[label] = this.getMetrics(label);
    });
    return result;
  }
}

// React component performance wrapper
export function withPerformanceMonitoring<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
): React.ComponentType<P> {
  return function PerformanceMonitoredComponent(props: P) {
    const endTimer = PerformanceMonitor.startTimer(`${componentName}_render`);
    
    try {
      const result = React.createElement(Component, props);
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      throw error;
    }
  };
}

// Visibility API hook for pausing updates when not visible
export function usePageVisibility() {
  const [isVisible, setIsVisible] = React.useState(true);
  
  React.useEffect(() => {
    if (typeof document === 'undefined') return; // SSR check
    
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
  
  return isVisible;
}

// Smart polling hook that respects visibility and connection status
export function useSmartPolling(
  callback: () => void | Promise<void>,
  interval: number,
  dependencies: any[] = []
) {
  const isVisible = usePageVisibility();
  const callbackRef = useRef(callback);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update callback ref
  React.useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  React.useEffect(() => {
    if (isVisible) {
      // Start polling when visible
      callbackRef.current();
      intervalRef.current = setInterval(() => {
        callbackRef.current();
      }, interval);
    } else {
      // Stop polling when not visible
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [interval, isVisible, ...dependencies]);
}