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

export interface HealthRequestContext {
  provider: HealthSnapshotProvider;
  dashboardHtml?: string;
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
}

export function startHealthServer(opts: StartHealthServerOptions): Server {
  const ctx: HealthRequestContext = {
    provider: opts.provider,
    dashboardHtml: opts.dashboardHtml,
  };
  const server = createServer((req, res) => handleHealthRequest(req, res, ctx));
  server.listen(opts.port ?? 8080, opts.hostname ?? '127.0.0.1');
  return server;
}
