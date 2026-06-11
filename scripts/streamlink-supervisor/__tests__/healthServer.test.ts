import http, { IncomingMessage } from 'http';
import { Socket } from 'net';
import { handleHealthRequest, startHealthServer } from '../healthServer';

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() })
      );
    }).on('error', reject);
  });
}

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
    const req = makeReq('GET', '/nope');
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

  describe('/reload', () => {
    const emptyProvider = { list: () => [] };
    const flush = () => new Promise(r => setTimeout(r, 0));

    it('POST /reload invokes onReload and returns its result', async () => {
      const onReload = jest.fn().mockResolvedValue({ added: ['s1'], removed: ['s2'], total: 3 });
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/reload'), res as any, { provider: emptyProvider, onReload });
      await flush();
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'ok', added: ['s1'], removed: ['s2'], total: 3 });
    });

    it('GET /reload returns 405 (reload is POST-only)', () => {
      const res = makeRes();
      handleHealthRequest(makeReq('GET', '/reload'), res as any, { provider: emptyProvider, onReload: jest.fn() });
      expect(res.statusCode).toBe(405);
    });

    it('POST /reload returns 501 when reload is not configured', () => {
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/reload'), res as any, { provider: emptyProvider });
      expect(res.statusCode).toBe(501);
    });

    it('POST /reload returns 500 when onReload throws', async () => {
      const onReload = jest.fn().mockRejectedValue(new Error('db down'));
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/reload'), res as any, { provider: emptyProvider, onReload });
      await flush();
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).toEqual({ error: 'db down' });
    });
  });

  describe('/streams/{id}/restart', () => {
    const emptyProvider = { list: () => [] };

    it('POST restart invokes onRestart with the streamId and returns 200 on success', () => {
      const onRestart = jest.fn().mockReturnValue(true);
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/team_alpha/restart'), res as any, {
        provider: emptyProvider,
        onRestart,
      });
      expect(onRestart).toHaveBeenCalledWith('team_alpha');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'ok', streamId: 'team_alpha' });
    });

    it('POST restart returns 404 when the stream is not supervised', () => {
      const onRestart = jest.fn().mockReturnValue(false);
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/ghost/restart'), res as any, {
        provider: emptyProvider,
        onRestart,
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'stream not found', streamId: 'ghost' });
    });

    it('decodes a URI-encoded streamId', () => {
      const onRestart = jest.fn().mockReturnValue(true);
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/team%20alpha/restart'), res as any, {
        provider: emptyProvider,
        onRestart,
      });
      expect(onRestart).toHaveBeenCalledWith('team alpha');
    });

    it('GET restart returns 405 (restart is POST-only)', () => {
      const onRestart = jest.fn();
      const res = makeRes();
      handleHealthRequest(makeReq('GET', '/streams/team_alpha/restart'), res as any, {
        provider: emptyProvider,
        onRestart,
      });
      expect(res.statusCode).toBe(405);
      expect(onRestart).not.toHaveBeenCalled();
    });

    it('POST restart returns 501 when onRestart is not configured', () => {
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/team_alpha/restart'), res as any, {
        provider: emptyProvider,
      });
      expect(res.statusCode).toBe(501);
    });
  });

  describe('/streams/{id}/start and /stop', () => {
    const emptyProvider = { list: () => [] };
    const flush = () => new Promise(r => setTimeout(r, 0));

    it('POST start invokes onStart and returns 200 on success', async () => {
      const onStart = jest.fn().mockResolvedValue(true);
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/team_alpha/start'), res as any, { provider: emptyProvider, onStart });
      await flush();
      expect(onStart).toHaveBeenCalledWith('team_alpha');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'ok', streamId: 'team_alpha' });
    });

    it('POST stop returns 404 when onStop reports the stream is unknown', async () => {
      const onStop = jest.fn().mockResolvedValue(false);
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/ghost/stop'), res as any, { provider: emptyProvider, onStop });
      await flush();
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'stream not found', streamId: 'ghost' });
    });

    it('POST stop returns 500 when onStop rejects', async () => {
      const onStop = jest.fn().mockRejectedValue(new Error('db locked'));
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/team_alpha/stop'), res as any, { provider: emptyProvider, onStop });
      await flush();
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).toEqual({ error: 'db locked' });
    });

    it('GET start returns 405', () => {
      const res = makeRes();
      handleHealthRequest(makeReq('GET', '/streams/team_alpha/start'), res as any, { provider: emptyProvider, onStart: jest.fn() });
      expect(res.statusCode).toBe(405);
    });

    it('POST start returns 501 when onStart is not configured', () => {
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/team_alpha/start'), res as any, { provider: emptyProvider });
      expect(res.statusCode).toBe(501);
    });
  });

  describe('GET /streams (DB-backed list)', () => {
    const flush = () => new Promise(r => setTimeout(r, 0));

    it('returns the merged list from listAll', async () => {
      const listAll = jest.fn().mockResolvedValue([
        { streamId: 'a', url: 'https://twitch.tv/a', disabled: 0, status: 'running', port: 9001, restartCount: 0, lastExitCode: null, lastExitSource: null },
      ]);
      const res = makeRes();
      handleHealthRequest(makeReq('GET', '/streams'), res as any, { provider: { list: () => [] }, listAll });
      await flush();
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).streams).toHaveLength(1);
    });

    it('returns 501 when listAll is not configured', () => {
      const res = makeRes();
      handleHealthRequest(makeReq('GET', '/streams'), res as any, { provider: { list: () => [] } });
      expect(res.statusCode).toBe(501);
    });

    it('returns 405 for non-GET', () => {
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams'), res as any, { provider: { list: () => [] }, listAll: jest.fn() });
      expect(res.statusCode).toBe(405);
    });
  });

  describe('malformed percent-escape handling (safeDecode → 400)', () => {
    const emptyProvider = { list: () => [] };

    it('POST /streams/%ZZ/restart returns 400 and does not call onRestart', () => {
      const onRestart = jest.fn().mockReturnValue(true);
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/%ZZ/restart'), res as any, {
        provider: emptyProvider,
        onRestart,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'bad request' });
      expect(onRestart).not.toHaveBeenCalled();
    });

    it('POST /streams/%ZZ/start returns 400 and does not call onStart', () => {
      const onStart = jest.fn().mockResolvedValue(true);
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/%ZZ/start'), res as any, {
        provider: emptyProvider,
        onStart,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'bad request' });
      expect(onStart).not.toHaveBeenCalled();
    });

    it('POST /streams/%ZZ/stop returns 400 and does not call onStop', () => {
      const onStop = jest.fn().mockResolvedValue(true);
      const res = makeRes();
      handleHealthRequest(makeReq('POST', '/streams/%ZZ/stop'), res as any, {
        provider: emptyProvider,
        onStop,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'bad request' });
      expect(onStop).not.toHaveBeenCalled();
    });
  });

  describe('default bind address', () => {
    it('binds 127.0.0.1 when no hostname is given (never 0.0.0.0)', async () => {
      const server = startHealthServer({ provider: { list: () => [] }, port: 0 });
      await new Promise<void>(resolve => server.once('listening', resolve));
      const addr = server.address() as { address: string; port: number };
      expect(addr.address).toBe('127.0.0.1');
      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      );
    });
  });

  describe('dispatch guard — synchronous handler throw returns 500 and keeps server alive', () => {
    it('throws inside provider.list → 500 JSON, server survives for subsequent requests', async () => {
      let callCount = 0;
      const server = startHealthServer({
        provider: {
          list: () => {
            callCount += 1;
            if (callCount === 1) throw new Error('boom');
            return [];
          },
        },
        port: 0,
      });

      await new Promise<void>(resolve => server.once('listening', resolve));
      const addr = server.address() as { port: number };
      const base = `http://127.0.0.1:${addr.port}`;

      // First request — provider throws synchronously → 500
      const r1 = await httpGet(`${base}/health`);
      expect(r1.status).toBe(500);
      expect(JSON.parse(r1.body)).toEqual({ error: 'internal error' });

      // Second request — server is still alive, provider now returns []
      const r2 = await httpGet(`${base}/health`);
      expect(r2.status).toBe(200);
      expect(JSON.parse(r2.body).status).toBe('ok');

      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      );
    });
  });
});
