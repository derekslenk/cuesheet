import { createServer, IncomingMessage, Server, ServerResponse } from 'http';

export interface HealthStreamSnapshot {
  streamId: string;
  status: string;
  restartCount: number;
  obsInputUrl: string;
}

export interface HealthSnapshotProvider {
  list: () => HealthStreamSnapshot[];
}

export interface ReloadResult {
  added: string[];
  removed: string[];
  total: number;
}

export interface DashboardStream {
  streamId: string;
  url: string;
  disabled: number;
  status: string; // 'running' | 'escalated' | 'stopped'
  port: number;
  restartCount: number;
  lastExitCode: number | null;
  lastExitSource: string | null;
}

export interface HealthRequestContext {
  provider: HealthSnapshotProvider;
  dashboardHtml?: string;
  // Re-reads the stream list from the DB and reconciles the supervisor
  // (start new, stop removed). Wired by runtime; absent in unit fixtures.
  onReload?: () => Promise<ReloadResult>;
  // Restarts a single supervised stream in place. Returns false if the stream
  // isn't supervised (unknown / operator-stopped). Wired by runtime.
  onRestart?: (streamId: string) => boolean;
  // Durably start/stop a single stream (flip `disabled`, then start/stop the
  // pipeline). Async because they write the DB. false => unknown streamId (404).
  onStart?: (streamId: string) => Promise<boolean>;
  onStop?: (streamId: string) => Promise<boolean>;
  // DB-backed list of ALL streams merged with live supervised status, so the
  // dashboard can show stopped streams (and host a Start button on them).
  listAll?: () => Promise<DashboardStream[]>;
}

// decodeURIComponent throws URIError on malformed percent-escapes (e.g. %ZZ).
// In a raw node:http request listener that throw becomes an uncaught exception
// that kills the daemon — and every pipeline with it. Decode defensively and
// let the route answer 400 instead.
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function handleHealthRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HealthRequestContext
): void {
  const url = req.url ?? '';

  if (url === '/' || url === '/dashboard') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    if (!ctx.dashboardHtml) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'dashboard not configured' }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(ctx.dashboardHtml);
    return;
  }

  if (url === '/reload') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    if (!ctx.onReload) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'reload not configured' }));
      return;
    }
    ctx.onReload()
      .then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', ...result }));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      });
    return;
  }

  // POST /streams/{streamId}/restart — operator-triggered single-stream restart.
  const restartMatch = url.match(/^\/streams\/([^/]+)\/restart$/);
  if (restartMatch) {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    if (!ctx.onRestart) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'restart not configured' }));
      return;
    }
    const streamId = safeDecode(restartMatch[1]);
    if (streamId === null) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad request' }));
      return;
    }
    const ok = ctx.onRestart(streamId);
    if (ok) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', streamId }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'stream not found', streamId }));
    }
    return;
  }

  // POST /streams/{streamId}/start and /stop — durable operator control.
  const startMatch = url.match(/^\/streams\/([^/]+)\/start$/);
  const stopMatch = url.match(/^\/streams\/([^/]+)\/stop$/);
  if (startMatch || stopMatch) {
    const isStart = Boolean(startMatch);
    const handler = isStart ? ctx.onStart : ctx.onStop;
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    if (!handler) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `${isStart ? 'start' : 'stop'} not configured` }));
      return;
    }
    const streamId = safeDecode((startMatch ?? stopMatch)![1]);
    if (streamId === null) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad request' }));
      return;
    }
    handler(streamId)
      .then(ok => {
        if (ok) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', streamId }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'stream not found', streamId }));
        }
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      });
    return;
  }

  // GET /streams — DB-backed list of ALL streams (incl. stopped) + live status.
  if (url === '/streams') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    if (!ctx.listAll) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'streams list not configured' }));
      return;
    }
    ctx.listAll()
      .then(streams => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ streams }));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      });
    return;
  }

  if (url !== '/health') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  const streams = ctx.provider.list();
  const allRunning = streams.every(s => s.status === 'running');
  const status = allRunning ? 'ok' : 'degraded';

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status, streams }));
}

export interface StartHealthServerOptions {
  provider: HealthSnapshotProvider;
  port?: number;
  hostname?: string;
  dashboardHtml?: string;
  onReload?: () => Promise<ReloadResult>;
  onRestart?: (streamId: string) => boolean;
  onStart?: (streamId: string) => Promise<boolean>;
  onStop?: (streamId: string) => Promise<boolean>;
  listAll?: () => Promise<DashboardStream[]>;
}

export function startHealthServer(opts: StartHealthServerOptions): Server {
  const ctx: HealthRequestContext = {
    provider: opts.provider,
    dashboardHtml: opts.dashboardHtml,
    onReload: opts.onReload,
    onRestart: opts.onRestart,
    onStart: opts.onStart,
    onStop: opts.onStop,
    listAll: opts.listAll,
  };
  // Belt-and-suspenders: wrap the handler so no synchronous throw can ever
  // escape the request callback and kill the daemon process.
  const server = createServer((req, res) => {
    try {
      handleHealthRequest(req, res, ctx);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal error' }));
      }
    }
  });
  server.listen(opts.port ?? 8080, opts.hostname ?? '127.0.0.1');
  return server;
}
