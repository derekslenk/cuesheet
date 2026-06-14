/**
 * @jest-environment node
 *
 * Tests for the Twitch Helix client. The global fetch is mocked so no network
 * call is made; credentials are injected via env.
 */
const {
  getTopLiveStreams,
  getViewerCount,
  getViewerCounts,
  twitchLoginFromUrl,
  hasTwitchCreds,
  TwitchCredentialsError,
  __resetTwitchTokenCache,
  __resetTwitchViewerCache,
} = require('../twitch');

const SAVED = {
  id: process.env.TWITCH_CLIENT_ID,
  secret: process.env.TWITCH_CLIENT_SECRET,
};

beforeEach(() => {
  __resetTwitchTokenCache();
  __resetTwitchViewerCache();
  process.env.TWITCH_CLIENT_ID = 'cid';
  process.env.TWITCH_CLIENT_SECRET = 'csec';
});

afterEach(() => {
  delete global.fetch;
});

afterAll(() => {
  if (SAVED.id === undefined) delete process.env.TWITCH_CLIENT_ID;
  else process.env.TWITCH_CLIENT_ID = SAVED.id;
  if (SAVED.secret === undefined) delete process.env.TWITCH_CLIENT_SECRET;
  else process.env.TWITCH_CLIENT_SECRET = SAVED.secret;
});

function mockFetch(streamsData) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts) => {
    const u = String(url);
    calls.push({ url: u, opts });
    if (u.includes('oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
    }
    if (u.includes('/streams')) {
      return { ok: true, json: async () => ({ data: streamsData }) };
    }
    throw new Error(`unexpected fetch ${u}`);
  });
  return calls;
}

describe('hasTwitchCreds', () => {
  it('reflects the env credentials', () => {
    expect(hasTwitchCreds()).toBe(true);
    delete process.env.TWITCH_CLIENT_ID;
    expect(hasTwitchCreds()).toBe(false);
  });
});

describe('getTopLiveStreams', () => {
  it('throws TwitchCredentialsError when credentials are missing', async () => {
    delete process.env.TWITCH_CLIENT_SECRET;
    await expect(getTopLiveStreams(5)).rejects.toBeInstanceOf(TwitchCredentialsError);
  });

  it('fetches a token then parses the live streams', async () => {
    const calls = mockFetch([
      { user_login: 'a', user_name: 'A', viewer_count: 10, game_name: 'G' },
      { user_login: 'b', user_name: 'B', viewer_count: 5, game_name: 'H' },
    ]);

    const res = await getTopLiveStreams(2);

    expect(res).toEqual([
      { login: 'a', displayName: 'A', viewerCount: 10, gameName: 'G' },
      { login: 'b', displayName: 'B', viewerCount: 5, gameName: 'H' },
    ]);
    expect(calls.some((c) => c.url.includes('oauth2/token'))).toBe(true);
    expect(calls.some((c) => c.url.includes('/streams?first=2'))).toBe(true);
  });

  it('sends Client-Id + Bearer token on the Helix request', async () => {
    const calls = mockFetch([]);
    await getTopLiveStreams(1);
    const helix = calls.find((c) => c.url.includes('/streams'));
    expect(helix.opts.headers['Client-Id']).toBe('cid');
    expect(helix.opts.headers.Authorization).toBe('Bearer tok');
  });

  it('throws on a non-ok Helix response', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('oauth2/token')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return { ok: false, status: 401, json: async () => ({}) };
    });
    await expect(getTopLiveStreams(1)).rejects.toThrow(/401/);
  });
});

function mockViewers(loginToCount) {
  const calls = [];
  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
    }
    if (u.includes('/streams')) {
      const data = Object.entries(loginToCount).map(([login, count]) => ({
        user_login: login,
        user_name: login,
        viewer_count: count,
        game_name: 'G',
      }));
      return { ok: true, json: async () => ({ data }) };
    }
    throw new Error(`unexpected fetch ${u}`);
  });
  return calls;
}

describe('twitchLoginFromUrl', () => {
  it('parses a twitch channel url (lowercased)', () => {
    expect(twitchLoginFromUrl('https://www.twitch.tv/Shroud')).toBe('shroud');
    expect(twitchLoginFromUrl('https://twitch.tv/abc_123')).toBe('abc_123');
  });
  it('returns null for non-twitch urls / empty', () => {
    expect(twitchLoginFromUrl('https://youtube.com/x')).toBeNull();
    expect(twitchLoginFromUrl('')).toBeNull();
    expect(twitchLoginFromUrl(null)).toBeNull();
  });
});

describe('getViewerCount / getViewerCounts', () => {
  it('returns null/empty (no throw) when credentials are missing', async () => {
    delete process.env.TWITCH_CLIENT_ID;
    await expect(getViewerCount('shroud')).resolves.toBeNull();
    const m = await getViewerCounts(['a', 'b']);
    expect(m.size).toBe(0);
  });

  it('returns the live viewer count for a channel', async () => {
    mockViewers({ shroud: 4200 });
    await expect(getViewerCount('Shroud')).resolves.toBe(4200);
  });

  it('returns null for an offline channel (not in the Helix response)', async () => {
    mockViewers({});
    await expect(getViewerCount('offlineguy')).resolves.toBeNull();
  });

  it('caches counts — a second lookup within TTL does not re-hit /streams', async () => {
    const calls = mockViewers({ a: 10, b: 20 });
    await getViewerCounts(['a', 'b']);
    const before = calls.filter((u) => u.includes('/streams')).length;
    await getViewerCounts(['a', 'b']);
    const after = calls.filter((u) => u.includes('/streams')).length;
    expect(after).toBe(before);
  });
});
