/**
 * @jest-environment node
 *
 * Tests for the Twitch Helix client. The global fetch is mocked so no network
 * call is made; credentials are injected via env.
 */
const {
  getTopLiveStreams,
  hasTwitchCreds,
  TwitchCredentialsError,
  __resetTwitchTokenCache,
} = require('../twitch');

const SAVED = {
  id: process.env.TWITCH_CLIENT_ID,
  secret: process.env.TWITCH_CLIENT_SECRET,
};

beforeEach(() => {
  __resetTwitchTokenCache();
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
