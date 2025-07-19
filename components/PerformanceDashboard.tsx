'use client';

import { useState, useEffect } from 'react';
import { PerformanceMonitor } from '@/lib/performance';

interface PerformanceMetrics {
  [key: string]: {
    avg: number;
    min: number;
    max: number;
    count: number;
  } | null;
}

export default function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({});
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isVisible) return;

    const updateMetrics = () => {
      setMetrics(PerformanceMonitor.getAllMetrics());
    };

    // Update metrics every 2 seconds when dashboard is visible
    updateMetrics();
    const interval = setInterval(updateMetrics, 2000);

    return () => clearInterval(interval);
  }, [isVisible]);

  // Only show in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isVisible ? (
        <button
          onClick={() => setIsVisible(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg"
          title="Show Performance Metrics"
        >
          📊 Perf
        </button>
      ) : (
        <div className="bg-black/90 backdrop-blur-sm text-white rounded-lg p-4 max-w-md max-h-96 overflow-y-auto shadow-xl border border-white/20">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Performance Metrics</h3>
            <button
              onClick={() => setIsVisible(false)}
              className="text-white/60 hover:text-white text-xl leading-none"
              title="Close"
            >
              ×
            </button>
          </div>
          
          {Object.keys(metrics).length === 0 ? (
            <p className="text-white/60 text-sm">No metrics collected yet.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(metrics).map(([label, metric]) => {
                if (!metric) return null;
                
                return (
                  <div key={label} className="bg-white/5 rounded p-3">
                    <h4 className="font-medium text-blue-300 text-sm mb-2">
                      {label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-white/60">Avg:</span>{' '}
                        <span className="text-green-400">{metric.avg.toFixed(2)}ms</span>
                      </div>
                      <div>
                        <span className="text-white/60">Count:</span>{' '}
                        <span className="text-blue-400">{metric.count}</span>
                      </div>
                      <div>
                        <span className="text-white/60">Min:</span>{' '}
                        <span className="text-green-400">{metric.min.toFixed(2)}ms</span>
                      </div>
                      <div>
                        <span className="text-white/60">Max:</span>{' '}
                        <span className={metric.max > 100 ? 'text-red-400' : 'text-yellow-400'}>
                          {metric.max.toFixed(2)}ms
                        </span>
                      </div>
                    </div>
                    
                    {/* Performance indicator */}
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className={`w-2 h-2 rounded-full ${
                            metric.avg < 50 ? 'bg-green-500' :
                            metric.avg < 100 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                        />
                        <span className="text-xs text-white/60">
                          {metric.avg < 50 ? 'Excellent' :
                           metric.avg < 100 ? 'Good' : 'Needs Optimization'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Performance tips */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 mt-4">
                <h4 className="font-medium text-yellow-300 text-sm mb-2">
                  💡 Performance Tips
                </h4>
                <ul className="text-xs text-white/80 space-y-1">
                  <li>• Keep API calls under 100ms for optimal UX</li>
                  <li>• Monitor fetchData and setActive timings</li>
                  <li>• High max values indicate performance spikes</li>
                  <li>• Consider caching for frequently called APIs</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}