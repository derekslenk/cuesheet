'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { isDev } from '@/lib/isDev';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="glass p-8 text-center max-w-md mx-auto mt-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold mb-4 text-red-400">
            Something went wrong
          </h2>
          <p className="text-white/80 mb-6">
            An unexpected error occurred. Please refresh the page or try again later.
          </p>
          <div className="button-group" style={{ justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-success"
            >
              <span className="icon">🔄</span>
              Refresh Page
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="btn-secondary"
            >
              <span className="icon">🔄</span>
              Try Again
            </button>
          </div>
          
          {isDev() && this.state.error && (
            <details className="mt-6 text-left">
              <summary className="text-red-400 cursor-pointer font-mono text-sm">
                Error Details (Development)
              </summary>
              <pre className="text-red-300 text-xs mt-2 p-3 bg-red-500/10 rounded border border-red-500/20 overflow-auto">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}