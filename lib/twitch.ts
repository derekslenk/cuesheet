/**
 * Minimal Twitch Helix client (app/client-credentials auth).
 *
 * Used by the live-test seeder (top live channels) and, later, the overlay's
 * live viewer counts (Phase 3 / US-006). Credentials come from the environment
 * (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET); there is no credential-free way to
 * query Twitch, so calls throw TwitchCredentialsError when they're unset.
 *
 * Server-side only. Uses the global fetch (Node 18+/22).
 */
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX_BASE = 'https://api.twitch.tv/helix';

export class TwitchCredentialsError extends Error {
  constructor() {
    super(
      'Twitch credentials missing: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET ' +
      'in .env.local (create an app at https://dev.twitch.tv/console/apps).'
    );
    this.name = 'TwitchCredentialsError';
  }
}

function readCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.TWITCH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Whether Twitch credentials are configured (no network call). */
export function hasTwitchCreds(): boolean {
  return readCreds() !== null;
}

// Cached app access token (client-credentials grant). Re-used until ~1 min
// before expiry to avoid a token request per call.
let cachedToken: { token: string; expiresAt: number } | null = null;

/** For tests: clear the in-memory token cache. */
export function __resetTwitchTokenCache(): void {
  cachedToken = null;
}

async function getAppAccessToken(now: number = Date.now()): Promise<string> {
  const creds = readCreds();
  if (!creds) throw new TwitchCredentialsError();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Twitch token request failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

async function helixGet(pathAndQuery: string): Promise<{ data?: unknown[]; pagination?: { cursor?: string } }> {
  const creds = readCreds();
  if (!creds) throw new TwitchCredentialsError();
  const token = await getAppAccessToken();
  const res = await fetch(`${HELIX_BASE}${pathAndQuery}`, {
    headers: { 'Client-Id': creds.clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Twitch Helix GET ${pathAndQuery} failed: ${res.status}`);
  return res.json();
}

export interface LiveStream {
  login: string;
  displayName: string;
  viewerCount: number;
  gameName: string;
}

interface HelixStream {
  user_login: string;
  user_name: string;
  viewer_count: number;
  game_name: string;
}

/**
 * Fetch the top `count` currently-live channels (Helix GET /streams returns live
 * streams ordered by viewer count, descending). Paginates in pages of 100.
 */
export async function getTopLiveStreams(count: number): Promise<LiveStream[]> {
  const out: LiveStream[] = [];
  let cursor: string | undefined;
  while (out.length < count) {
    const first = Math.min(100, count - out.length);
    const q = `/streams?first=${first}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`;
    const page = await helixGet(q);
    const rows = (page.data ?? []) as HelixStream[];
    for (const s of rows) {
      out.push({
        login: s.user_login,
        displayName: s.user_name,
        viewerCount: s.viewer_count,
        gameName: s.game_name,
      });
    }
    cursor = page.pagination?.cursor;
    if (!cursor || rows.length === 0) break;
  }
  return out.slice(0, count);
}
