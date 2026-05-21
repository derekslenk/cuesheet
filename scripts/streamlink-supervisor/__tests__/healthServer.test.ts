import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { handleHealthRequest } from '../healthServer';

interface SnapshotProvider {
  list: () => Array<{ streamId: string; status: string; restartCount: number; obsInputUrl: string }>;
}

function makeReq(method: string, url: string): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  return req;
}

interface FakeRes {
  statusCode: number;
  setHeader(name: string, value: string): void;
  writeHead(code: number, h?: Record<string, string>): void;
  end(body?: string): void;
  readonly body: string;
  readonly headers: Record<string, string>;
}

function makeRes(): FakeRes {
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  const res: FakeRes = {
    statusCode: 200,
    setHeader(name, value) {
      headers[name] = value;
    },
    writeHead(code, h) {
      res.statusCode = code;
      Object.assign(headers, h ?? {});
    },
    end(body) {
      if (body) chunks.push(body);
    },
    get body() {
      return chunks.join('');
    },
    get headers() {
      return headers;
    },
  };
  return res;
}

describe('handleHealthRequest', () => {
  const provider: SnapshotProvider = {
    list: () => [
      { streamId: 'team_alpha', status: 'running', restartCount: 0, obsInputUrl: 'udp://127.0.0.1:9001' },
      { streamId: 'team_beta', status: 'escalated', restartCount: 3, obsInputUrl: 'udp://127.0.0.1:9002' },
    ],
  };

  it('GET /health returns 200 with { status, streams: [...] }', () => {
    const req = makeReq('GET', '/health');
    const res = makeRes();

    handleHealthRequest(req, res as any, { provider });

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toMatch(/application\/json/);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      status: 'degraded',
      streams: provider.list(),
    });
  });

  it('returns status=ok when all streams are running', () => {
    const allGreen: SnapshotProvider = {
      list: () => [
        { streamId: 'a', status: 'running', restartCount: 0, obsInputUrl: 'udp://127.0.0.1:9001' },
        { streamId: 'b', status: 'running', restartCount: 1, obsInputUrl: 'udp://127.0.0.1:9002' },
      ],
    };
    const req = makeReq('GET', '/health');
    const res = makeRes();

    handleHealthRequest(req, res as any, { provider: allGreen });

    expect(JSON.parse(res.body).status).toBe('ok');
  });

  it('returns status=ok with empty stream list when supervisor has no streams', () => {
    const empty: SnapshotProvider = { list: () => [] };
    const req = makeReq('GET', '/health');
    const res = makeRes();

    handleHealthRequest(req, res as any, { provider: empty });

    const body = JSON.parse(res.body);
    expect(body).toEqual({ status: 'ok', streams: [] });
  });

  it('returns 404 for any other path', () => {
    const req = makeReq('GET', '/streams');
    const res = makeRes();
    handleHealthRequest(req, res as any, { provider });
    expect(res.statusCode).toBe(404);
  });

  it('returns 405 for non-GET methods on /health', () => {
    const req = makeReq('POST', '/health');
    const res = makeRes();
    handleHealthRequest(req, res as any, { provider });
    expect(res.statusCode).toBe(405);
  });

  describe('dashboard route', () => {
    const HTML = '<!doctype html><title>x</title>';

    it('GET / returns the dashboard HTML when configured', () => {
      const req = makeReq('GET', '/');
      const res = makeRes();
      handleHealthRequest(req, res as any, { provider, dashboardHtml: HTML });
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toMatch(/text\/html/);
      expect(res.headers['Cache-Control']).toBe('no-store');
      expect(res.body).toBe(HTML);
    });

    it('GET /dashboard also serves the dashboard HTML', () => {
      const req = makeReq('GET', '/dashboard');
      const res = makeRes();
      handleHealthRequest(req, res as any, { provider, dashboardHtml: HTML });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(HTML);
    });

    it('GET / returns 404 when dashboardHtml is not configured', () => {
      const req = makeReq('GET', '/');
      const res = makeRes();
      handleHealthRequest(req, res as any, { provider });
      expect(res.statusCode).toBe(404);
    });

    it('POST / returns 405 (dashboard is read-only)', () => {
      const req = makeReq('POST', '/');
      const res = makeRes();
      handleHealthRequest(req, res as any, { provider, dashboardHtml: HTML });
      expect(res.statusCode).toBe(405);
    });

    it('does not leak the dashboard HTML to /health responses', () => {
      const req = makeReq('GET', '/health');
      const res = makeRes();
      handleHealthRequest(req, res as any, { provider, dashboardHtml: HTML });
      expect(res.headers['Content-Type']).toMatch(/application\/json/);
      expect(res.body).not.toContain('<title>');
    });
  });
});
