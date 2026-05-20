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

function makeRes() {
  const chunks: string[] = [];
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const res = {
    statusCode,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    writeHead(code: number, h?: Record<string, string>) {
      this.statusCode = code;
      Object.assign(headers, h ?? {});
    },
    end(body?: string) {
      if (body) chunks.push(body);
    },
    get body() {
      return chunks.join('');
    },
    get headers() {
      return headers;
    },
  } as unknown as ServerResponse & { body: string; headers: Record<string, string> };
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

    handleHealthRequest(req, res as any, provider);

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

    handleHealthRequest(req, res as any, allGreen);

    expect(JSON.parse(res.body).status).toBe('ok');
  });

  it('returns status=ok with empty stream list when supervisor has no streams', () => {
    const empty: SnapshotProvider = { list: () => [] };
    const req = makeReq('GET', '/health');
    const res = makeRes();

    handleHealthRequest(req, res as any, empty);

    const body = JSON.parse(res.body);
    expect(body).toEqual({ status: 'ok', streams: [] });
  });

  it('returns 404 for any other path', () => {
    const req = makeReq('GET', '/streams');
    const res = makeRes();
    handleHealthRequest(req, res as any, provider);
    expect(res.statusCode).toBe(404);
  });

  it('returns 405 for non-GET methods on /health', () => {
    const req = makeReq('POST', '/health');
    const res = makeRes();
    handleHealthRequest(req, res as any, provider);
    expect(res.statusCode).toBe(405);
  });
});
