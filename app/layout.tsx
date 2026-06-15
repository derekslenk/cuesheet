import './globals.css';

export const metadata = {
  title: 'CueSheet',
  description: 'A tool to manage live stream sources dynamically',
};

// Root layout is intentionally bare: a single <html>/<body> shared by every
// route group. The CRT app chrome (Header/Footer/providers + the phosphor
// background and scanline overlay) lives in app/(app)/layout.tsx, so the
// (overlay) route group can render transparent pages for OBS browser sources
// without inheriting an opaque background. There must be exactly ONE <body> in
// the tree — route-group layouts wrap `children` in a <div>, never a second body.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
