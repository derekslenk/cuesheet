'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();
  
  const isActive = (path: string) => pathname === path;
  
  return (
    <header className="glass p-6 mb-8">
      <div className="container">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="icon-md text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">Live Stream Manager</h1>
              <p className="text-sm opacity-80">Professional Control</p>
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="button-group">
            <Link 
              href="/" 
              className={`btn ${isActive('/') ? 'active' : ''}`}
            >
              <span className="icon">🏠</span>
              Home
            </Link>
            
            <Link 
              href="/streams" 
              className={`btn ${isActive('/streams') ? 'active' : ''}`}
            >
              <span className="icon">🎥</span>
              Streams
            </Link>
            
            <Link 
              href="/teams" 
              className={`btn ${isActive('/teams') ? 'active' : ''}`}
            >
              <span className="icon">👥</span>
              Teams
            </Link>
            
            <Link 
              href="/settings" 
              className={`btn ${isActive('/settings') ? 'active' : ''}`}
            >
              <span className="icon">⚙️</span>
              Settings
            </Link>
            
            {process.env.NODE_ENV === 'development' && (
              <Link 
                href="/performance" 
                className={`btn ${isActive('/performance') ? 'active' : ''}`}
              >
                <span className="icon">📊</span>
                Perf
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}