import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ApiKeyProvider } from '@/contexts/ApiKeyContext';

// Layout for the interactive control app (every page EXCEPT OBS overlays).
// It owns the CRT app shell: the `.app-shell` wrapper carries the phosphor
// background + scanline overlay (moved off <body> so overlays stay transparent),
// and ApiKeyProvider wraps every consumer of useApiKey (settings page,
// ApiKeyPrompt). The single <body> lives in the root layout.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex flex-col">
      <ApiKeyProvider>
        <Header />
        <main className="flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <Footer />
      </ApiKeyProvider>
    </div>
  );
}
