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
  live: { viewers: null },
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
});
