'use client';

import { useEffect, useState } from 'react';
import type { OverlayData } from '@/lib/overlayData';

type FetchState =
  | { status: 'loading' }
  | { status: 'ready'; data: OverlayData }
  | { status: 'error' } // unknown id (404) — stale/dead baked overlay URL
  | { status: 'servererror' }; // 5xx — the overlay system itself is failing

/**
 * Client-rendered stream label. Fetches the OverlayData contract and renders the
 * broadcast plate; the CSS entrance animation fires on mount (which is when data
 * arrives). On an unknown id (404) it renders a VISIBLE "NO DATA" placeholder so
 * a stale/dead overlay URL is caught in QA, never a silent transparent gap.
 *
 * Static fields (name/team/colors/logo/role) come from the initial fetch; the
 * live viewer count is polled separately from /api/overlay/[id]/viewers every
 * ~30s once data is ready (Phase 3 / US-006). The count is best-effort — it is
 * simply omitted when null (offline / no Twitch creds), never blocking render.
 */
const VIEWERS_POLL_MS = 30_000;

export default function StreamLabel({ id }: { id: string }) {
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [viewers, setViewers] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/overlay/${id}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          // 5xx = server/DB failure (distinct on-screen so QA can tell it from a
          // stale 404); anything else (404) = unknown/stale id.
          if (!cancelled) setState({ status: res.status >= 500 ? 'servererror' : 'error' });
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

  // Poll the live viewer count once the stream's data is ready. Independent of
  // the main fetch so a slow/failed Twitch lookup never affects the label body.
  useEffect(() => {
    if (state.status !== 'ready') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/overlay/${id}/viewers`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { viewers?: number | null };
        if (!cancelled) setViewers(typeof data.viewers === 'number' ? data.viewers : null);
      } catch {
        // keep the last known value on a transient failure
      }
    };
    poll();
    const timer = setInterval(poll, VIEWERS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, state.status]);

  // Transparent until data resolves — never flash an empty plate.
  if (state.status === 'loading') return null;

  if (state.status === 'servererror') {
    return <div className="ovl-error">SERVER ERROR · id={id}</div>;
  }

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
      {d.role || viewers != null ? (
        <div className="lbl-meta">
          {d.role ? <span className="lbl-role">{d.role}</span> : null}
          {viewers != null ? (
            <span className="lbl-viewers">
              <span className="lbl-live-dot" aria-hidden="true" />
              {viewers.toLocaleString()}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
