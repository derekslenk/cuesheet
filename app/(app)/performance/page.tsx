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

export default function PerformancePage() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({});

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(PerformanceMonitor.getAllMetrics());
    };

    // Update metrics every 2 seconds
    updateMetrics();
    const interval = setInterval(updateMetrics, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl" style={{ paddingBottom: '48px' }}>
      <div className="glass-panel p-8">
        <h1 className="text-3xl font-bold text-white mb-8">Performance Metrics</h1>
        
        {Object.keys(metrics).length === 0 ? (
          <div className="glass-panel p-6 border border-base01 text-center">
            <p className="text-base1">No metrics collected yet. Navigate around the app to see performance data.</p>
          </div>
        ) : (
          <div className="grid" style={{ gap: '24px' }}>
            {Object.entries(metrics).map(([label, metric]) => {
              if (!metric) return null;
              
              return (
                <div key={label} className="glass-panel p-6 border border-base01">
                  <h2 className="font-semibold text-blue text-lg mb-4">
                    {label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </h2>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: '16px' }}>
                    <div className="glass-panel p-4 border border-base01">
                      <span className="text-base1 text-sm block mb-2">Average</span>
                      <span className="text-green text-xl font-semibold">{metric.avg.toFixed(2)}ms</span>
                    </div>
                    
                    <div className="glass-panel p-4 border border-base01">
                      <span className="text-base1 text-sm block mb-2">Min</span>
                      <span className="text-green text-xl font-semibold">{metric.min.toFixed(2)}ms</span>
                    </div>
                    
                    <div className="glass-panel p-4 border border-base01">
                      <span className="text-base1 text-sm block mb-2">Max</span>
                      <span className={`text-xl font-semibold ${metric.max > 100 ? 'text-red' : 'text-yellow'}`}>
                        {metric.max.toFixed(2)}ms
                      </span>
                    </div>
                    
                    <div className="glass-panel p-4 border border-base01">
                      <span className="text-base1 text-sm block mb-2">Count</span>
                      <span className="text-blue text-xl font-semibold">{metric.count}</span>
                    </div>
                  </div>
                  
                  {/* Performance indicator bar */}
                  <div className="mt-6">
                    <div className="flex items-center" style={{ gap: '16px' }}>
                      <div className="flex-1 h-2 bg-base02 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${
                            metric.avg < 50 ? 'bg-green' :
                            metric.avg < 100 ? 'bg-yellow' : 'bg-red'
                          }`}
                          style={{ width: `${Math.min((metric.avg / 200) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm text-base1 min-w-[100px] text-right">
                        {metric.avg < 50 ? 'Excellent' :
                         metric.avg < 100 ? 'Good' : 'Needs Optimization'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Performance tips */}
            <div className="glass-panel p-6 border border-yellow/30">
              <h2 className="font-semibold text-yellow text-lg mb-4">💡 Performance Tips</h2>
              <div className="grid md:grid-cols-2 text-base1" style={{ gap: '24px' }}>
                <div>
                  <h3 className="font-medium text-white mb-3">Response Times</h3>
                  <ul className="text-sm space-y-2" style={{ paddingLeft: '8px' }}>
                    <li>&lt; 50ms - Excellent user experience</li>
                    <li>50-100ms - Good, barely noticeable</li>
                    <li>100-300ms - Noticeable delay</li>
                    <li>&gt; 300ms - Frustrating for users</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-medium text-white mb-3">Optimization Strategies</h3>
                  <ul className="text-sm space-y-2" style={{ paddingLeft: '8px' }}>
                    <li>Monitor fetchData and setActive timings</li>
                    <li>High max values indicate performance spikes</li>
                    <li>Consider caching for frequently called APIs</li>
                    <li>Batch multiple requests when possible</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}