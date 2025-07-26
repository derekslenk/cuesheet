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
    <>
      {!isVisible && (
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={() => setIsVisible(true)}
            className="btn text-sm"
            title="Show Performance Metrics"
          >
            📊 Perf
          </button>
        </div>
      )}
      
      {isVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-panel p-6 max-w-md max-h-96 overflow-y-auto border border-base01 shadow-2xl">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-white">Performance Metrics</h3>
            <button
              onClick={() => setIsVisible(false)}
              className="text-base1 hover:text-white text-xl leading-none transition-colors"
              title="Close"
            >
              ×
            </button>
          </div>
          
          {Object.keys(metrics).length === 0 ? (
            <p className="text-base1 text-sm">No metrics collected yet.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(metrics).map(([label, metric]) => {
                if (!metric) return null;
                
                return (
                  <div key={label} className="glass-panel p-3 border border-base01">
                    <h4 className="font-medium text-blue text-sm mb-2">
                      {label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-base1">Avg:</span>{' '}
                        <span className="text-green">{metric.avg.toFixed(2)}ms</span>
                      </div>
                      <div>
                        <span className="text-base1">Count:</span>{' '}
                        <span className="text-blue">{metric.count}</span>
                      </div>
                      <div>
                        <span className="text-base1">Min:</span>{' '}
                        <span className="text-green">{metric.min.toFixed(2)}ms</span>
                      </div>
                      <div>
                        <span className="text-base1">Max:</span>{' '}
                        <span className={metric.max > 100 ? 'text-red' : 'text-yellow'}>
                          {metric.max.toFixed(2)}ms
                        </span>
                      </div>
                    </div>
                    
                    {/* Performance indicator */}
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className={`w-2 h-2 rounded-full ${
                            metric.avg < 50 ? 'bg-green' :
                            metric.avg < 100 ? 'bg-yellow' : 'bg-red'
                          }`}
                        />
                        <span className="text-xs text-base1">
                          {metric.avg < 50 ? 'Excellent' :
                           metric.avg < 100 ? 'Good' : 'Needs Optimization'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Performance tips */}
              <div className="glass-panel p-3 mt-4 border border-yellow/30">
                <h4 className="font-medium text-yellow text-sm mb-2">
                  💡 Performance Tips
                </h4>
                <ul className="text-xs text-base1 space-y-1">
                  <li>• Keep API calls under 100ms for optimal UX</li>
                  <li>• Monitor fetchData and setActive timings</li>
                  <li>• High max values indicate performance spikes</li>
                  <li>• Consider caching for frequently called APIs</li>
                </ul>
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </>
  );
}