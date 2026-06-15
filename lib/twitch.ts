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

// First-path segments on twitch.tv that are site features, not channels. A URL
// like twitch.tv/directory or twitch.tv/videos/123 would otherwise yield a
// bogus "login" and waste a Helix lookup (which just returns offline).
const TWITCH_RESERVED_PATHS = new Set([
  'directory', 'videos', 'p', 'downloads', 'jobs', 'turbo', 'settings',
  'subscriptions', 'friends', 'wallet', 'drops', 'prime',
]);

/**
 * Extract a Twitch login from a channel URL (https://www.twitch.tv/<login>).
 * Returns the lowercased login, or null if the URL isn't a Twitch channel URL
 * (or points at a reserved site path like /directory or /videos).
 */
export function twitchLoginFromUrl(url: string | null | undefined): string | null {
  const m = /(?:^|[/.])twitch\.tv\/([A-Za-z0-9_]{1,30})/i.exec(url || '');
  if (!m) return null;
  const login = m[1].toLowerCase();
  return TWITCH_RESERVED_PATHS.has(login) ? null : login;
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

// Short-TTL viewer-count cache, keyed by login, so repeated polls of the same
// label (and many labels of the same channel) don't hammer Helix. A login that
// is offline is cached with count null so we don't re-query it every poll.
const VIEWER_TTL_MS = 25_000;
const viewerCache = new Map<string, { count: number | null; at: number }>();

/** For tests: clear the in-memory viewer-count cache. */
export function __resetTwitchViewerCache(): void {
  viewerCache.clear();
}

/**
 * Current viewer counts for the given logins, batched (<=100/request) and
 * cached. Returns a map of login -> count for channels that are LIVE; offline
 * channels are omitted. Best-effort: returns an empty map (no throw) when
 * credentials are missing, so a viewer count is never required for the label to
 * render. Real API errors (bad creds, 5xx) DO throw so the caller can log them.
 */
export async function getViewerCounts(
  logins: string[],
  now: number = Date.now()
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!readCreds()) return result;

  const wanted = Array.from(new Set(logins.map((l) => l.toLowerCase())));
  const need: string[] = [];
  for (const login of wanted) {
    const cached = viewerCache.get(login);
    if (cached && cached.at > now - VIEWER_TTL_MS) {
      if (cached.count != null) result.set(login, cached.count);
    } else {
      need.push(login);
    }
  }

  for (let i = 0; i < need.length; i += 100) {
    const batch = need.slice(i, i + 100);
    const q = '/streams?' + batch.map((l) => `user_login=${encodeURIComponent(l)}`).join('&');
    const page = await helixGet(q);
    const live = new Set<string>();
    for (const s of (page.data ?? []) as HelixStream[]) {
      const login = s.user_login.toLowerCase();
      viewerCache.set(login, { count: s.viewer_count, at: now });
      result.set(login, s.viewer_count);
      live.add(login);
    }
    // Logins not returned are offline — cache null so they aren't re-queried.
    for (const login of batch) {
      if (!live.has(login)) viewerCache.set(login, { count: null, at: now });
    }
  }
  return result;
}

/** Convenience: current viewer count for one login (null if offline / no creds). */
export async function getViewerCount(login: string, now: number = Date.now()): Promise<number | null> {
  const counts = await getViewerCounts([login], now);
  return counts.get(login.toLowerCase()) ?? null;
}
