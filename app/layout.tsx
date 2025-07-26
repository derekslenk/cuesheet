import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ApiKeyProvider } from '@/contexts/ApiKeyContext';

export const metadata = {
  title: 'Live Stream Manager',
  description: 'A tool to manage live stream sources dynamically',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <ApiKeyProvider>
          <Header />
          <main className="flex-1">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
          <Footer />
        </ApiKeyProvider>
      </body>
    </html>
  );
}