import './overlay.css';

export const metadata = {
  title: 'CueSheet Overlay',
};

// Bare layout for OBS browser-source overlays. No app chrome, no .app-shell —
// the single <body> (root layout) is transparent, so these pages composite over
// the underlying video in OBS. overlay.css owns the label styling + the bundled
// webfont; the wrapper just fills the canvas and stays transparent.
export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return <div className="ovl-root">{children}</div>;
}
