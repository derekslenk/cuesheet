'use client';

import { useEffect, useRef, useState } from 'react';

interface StreamPreviewProps {
  streamId: number;
  /** Display label (stream name) for the preview frame header. */
  label?: string;
}

type PreviewState = 'loading' | 'live' | 'error';

/**
 * In-browser live preview of a stream's actual relay output.
 *
 * Plays the HLS feed served at /api/preview/<id>/index.m3u8 (transmuxed from
 * the supervisor's preview UDP tee). hls.js is dynamically imported so it only
 * loads when a preview is actually opened. Safari plays the playlist natively.
 */
export default function StreamPreview({ streamId, label }: StreamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<PreviewState>('loading');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const src = `/api/preview/${streamId}/index.m3u8`;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hls: any = null;

    (async () => {
      const Hls = (await import('hls.js')).default;
      if (cancelled) return;

      if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 3,
          // The packager needs a beat to spin up — retry the manifest instead
          // of failing the first time it 503s.
          manifestLoadingMaxRetry: 12,
          manifestLoadingRetryDelay: 600,
          manifestLoadingMaxRetryTimeout: 8000,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          setState('live');
          video.play().catch(() => { /* autoplay may be blocked; controls remain */ });
        });
        hls.on(Hls.Events.ERROR, (_evt: unknown, data: { fatal: boolean; type: string }) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();           // transient (e.g. 503 while warming up)
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setState('error');
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / iOS native HLS
        video.src = src;
        video.addEventListener('loadedmetadata', () => {
          if (cancelled) return;
          setState('live');
          video.play().catch(() => {});
        });
        video.addEventListener('error', () => setState('error'));
      } else {
        setState('error');
      }
    })();

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [streamId]);

  return (
    <div
      className="glass-panel"
      style={{ marginTop: '12px', padding: '12px', overflow: 'hidden' }}
    >
      <div
        className="flex items-center justify-between mb-2"
        style={{
          fontSize: '12px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--crt-text-dim, #5a8a6c)',
        }}
      >
        <span>&gt; preview :: {label ?? `stream ${streamId}`}</span>
        <span className="flex items-center" style={{ gap: '6px' }}>
          <span
            className={`status-dot ${state === 'live' ? 'streaming' : 'idle'}`}
            style={{ width: '9px', height: '9px' }}
          />
          {state === 'live' ? 'LIVE' : state === 'error' ? 'NO SIGNAL' : 'TUNING…'}
        </span>
      </div>

      <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          controls
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
        />
        {state !== 'live' && (
          <div
            className="flex items-center justify-center"
            style={{
              position: 'absolute',
              inset: 0,
              color: state === 'error' ? 'var(--crt-red, #ff5c57)' : 'var(--crt-green-dim, #1f9a4d)',
              fontSize: '13px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textShadow: state === 'error'
                ? 'var(--glow-red, 0 0 6px rgba(255,92,87,0.55))'
                : 'var(--glow-green, 0 0 6px rgba(61,255,122,0.55))',
              pointerEvents: 'none',
            }}
          >
            {state === 'error' ? 'no signal on relay' : 'acquiring feed…'}
          </div>
        )}
      </div>
    </div>
  );
}
