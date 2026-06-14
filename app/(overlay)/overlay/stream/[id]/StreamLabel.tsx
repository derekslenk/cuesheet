'use client';

import { useEffect, useState } from 'react';
import type { OverlayData } from '@/lib/overlayData';

type FetchState =
  | { status: 'loading' }
  | { status: 'ready'; data: OverlayData }
  | { status: 'error' };

/**
 * Client-rendered stream label. Fetches the OverlayData contract and renders the
 * broadcast plate; the CSS entrance animation fires on mount (which is when data
 * arrives). On an unknown id (404) it renders a VISIBLE "NO DATA" placeholder so
 * a stale/dead overlay URL is caught in QA, never a silent transparent gap.
 *
 * Static fields (name/team/colors/logo/role) come from this initial fetch; the
 * live viewer count + a no-reload update channel arrive in Phase 3 (US-006),
 * which is why the live slot is already wired but hidden while viewers is null.
 */
export default function StreamLabel({ id }: { id: string }) {
  const [state, setState] = useState<FetchState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/overlay/${id}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setState({ status: 'error' });
          return;
        }
        const data = (await res.json()) as OverlayData;
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Transparent until data resolves — never flash an empty plate.
  if (state.status === 'loading') return null;

  if (state.status === 'error') {
    return <div className="ovl-nodata">NO DATA · id={id}</div>;
  }

  const d = state.data;
  // Per-team palette flows in as CSS custom properties so the same stylesheet
  // restyles every team (Phase 1 / US-003 just populates these from the DB).
  const style = {
    '--lbl-bg': d.colors.bg,
    '--lbl-accent': d.colors.accent,
    '--lbl-text': d.colors.text,
  } as React.CSSProperties;

  return (
    <div className="lbl" style={style}>
      <span className="lbl-accent" aria-hidden="true" />
      {d.logoUrl ? (
        // Overlay is a standalone CEF page; next/image's optimizer/runtime is
        // unwanted here, so a plain <img> is intentional.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lbl-logo" src={d.logoUrl} alt="" />
      ) : null}
      <div className="lbl-text">
        {d.teamName ? <div className="lbl-team">{d.teamName}</div> : null}
        <div className="lbl-name">{d.streamerName}</div>
      </div>
      {d.role || d.live.viewers != null ? (
        <div className="lbl-meta">
          {d.role ? <span className="lbl-role">{d.role}</span> : null}
          {d.live.viewers != null ? (
            <span className="lbl-viewers">
              <span className="lbl-live-dot" aria-hidden="true" />
              {d.live.viewers.toLocaleString()}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
