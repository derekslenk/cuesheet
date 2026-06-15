import { render, screen } from '@testing-library/react';
import StreamLabel from '../StreamLabel';

const DATA = {
  ok: true,
  streamId: 1,
  streamerName: 'Nova',
  teamName: 'Test Alpha',
  colors: { bg: '#14213d', accent: '#fca311', text: '#ffffff' },
  logoUrl: null,
  role: null,
  score: null,
};

function installFetch(opts: { dataOk?: boolean; viewers: number | null }) {
  const fn = jest.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.endsWith('/viewers')) {
      return { ok: true, json: async () => ({ viewers: opts.viewers }) } as unknown as Response;
    }
    return { ok: opts.dataOk ?? true, json: async () => DATA } as unknown as Response;
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  jest.restoreAllMocks();
  // @ts-expect-error allow deleting the test-injected fetch
  delete global.fetch;
});

describe('StreamLabel', () => {
  it('renders the team, streamer name, and the polled live viewer count', async () => {
    installFetch({ viewers: 1234 });

    render(<StreamLabel id="1" />);

    expect(await screen.findByText('Test Alpha')).toBeInTheDocument();
    expect(await screen.findByText('Nova')).toBeInTheDocument();
    // 1234 -> locale string "1,234"
    expect(await screen.findByText('1,234')).toBeInTheDocument();
  });

  it('omits the viewer count when it is null (offline / no creds)', async () => {
    installFetch({ viewers: null });

    const { container } = render(<StreamLabel id="1" />);

    expect(await screen.findByText('Nova')).toBeInTheDocument();
    expect(container.querySelector('.lbl-viewers')).toBeNull();
  });

  it('renders a visible NO DATA placeholder when the stream is unknown (404)', async () => {
    installFetch({ dataOk: false, viewers: null });

    render(<StreamLabel id="999" />);

    expect(await screen.findByText(/NO DATA/)).toBeInTheDocument();
  });

  it('renders a distinct SERVER ERROR placeholder on a 5xx response', async () => {
    const fn = jest.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/viewers')) {
        return { ok: true, json: async () => ({ viewers: null }) } as unknown as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    });
    global.fetch = fn as unknown as typeof fetch;

    render(<StreamLabel id="5" />);

    expect(await screen.findByText(/SERVER ERROR/)).toBeInTheDocument();
  });

  it('renders the role chip when the stream has a role', async () => {
    const fn = jest.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/viewers')) {
        return { ok: true, json: async () => ({ viewers: null }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ ...DATA, role: 'Tank' }) } as unknown as Response;
    });
    global.fetch = fn as unknown as typeof fetch;

    render(<StreamLabel id="1" />);

    expect(await screen.findByText('Tank')).toBeInTheDocument();
  });
});
