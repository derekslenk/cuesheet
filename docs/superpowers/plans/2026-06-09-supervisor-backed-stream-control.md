# Supervisor-backed Stream Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the always-on streamlink supervisor the single control backend for per-stream Start/Stop/Restart, exposed through both the supervisor dashboard and the web `/streams` page, with the supervisor owning the durable `disabled` flag.

**Architecture:** Two isolated processes (web UI + supervisor) over one shared `sources.db` in WAL mode. The supervisor opens the DB read-write and exposes `POST /streams/{id}/{start,stop,restart}` plus a DB-backed `GET /streams`. Both UIs are thin views that POST to it; web routes forward to the supervisor and fall back to a labeled "break-glass" DB write only when the supervisor is unreachable.

**Tech Stack:** TypeScript, Next.js 15 (App Router), Node `sqlite`/`sqlite3` (web + tsx supervisor), Bun `bun:sqlite` (compiled supervisor binaries), Jest, plain HTML/JS dashboard.

**Spec:** `docs/superpowers/specs/2026-06-09-supervisor-backed-stream-control-design.md`

**Branch:** `feat/stream-control-buttons` (existing WIP stays; this builds on it as one coherent change — no separate checkpoint commit).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `scripts/streamlink-supervisor/streamSpecsLoader.ts` | DB row access: `MinimalDb` (now with `run` + params), `assertSafeTableName`, `rowToSpec`, `isValidRow`, `loadStreamRows`, `loadStreamSpec`, `loadStreamSpecs` | Modify |
| `lib/database.ts` | Web/tsx RW handle — add WAL + busy_timeout | Modify |
| `scripts/streamlink-supervisor/healthServer.ts` | HTTP surface — `DashboardStream`, `onStart`/`onStop`/`listAll`, new routes | Modify |
| `scripts/streamlink-supervisor/runtime.ts` | Wire `onStart`/`onStop`/`listAll` closures over the RW db | Modify |
| `lib/supervisorClient.ts` | `requestSupervisorStart`/`Stop` + result type | Modify |
| `app/api/supervisor/streams/[id]/stop/route.ts` | Forward to supervisor; break-glass fallback | Rewrite |
| `app/api/supervisor/streams/[id]/start/route.ts` | Forward to supervisor; break-glass fallback | Rewrite |
| `app/api/supervisor/streams/[id]/restart/route.ts` | Align result shape | Modify |
| `src/cli/types/bun-shims.d.ts` | Add `run`/`exec` to the bun:sqlite shim | Modify |
| `scripts/streamlink-supervisor/bunDatabase.ts` | ONE shared RW bun opener for both bun entrypoints | Create |
| `scripts/streamlink-supervisor/index.bun.ts` | Use shared opener | Modify |
| `src/cli/commands/supervisor.bun.ts` | Use shared opener | Modify |
| `scripts/streamlink-supervisor/dashboard.html` | Controls + DB-backed list + colorblind glyphs | Modify |
| `app/streams/page.tsx` | Drop optimistic write; surface `degraded` | Modify |
| `.gitignore` | Ignore `*.db-wal` / `*.db-shm` | Modify |
| docs (`README.md`, `AGENTS.md` x3) | Document endpoints/behavior | Modify/Create |
| `lib/__tests__/database.wal.test.ts` | WAL pragma test | Create |
| `lib/__tests__/supervisorClient.test.ts` | client helper tests | Create |
| `app/api/supervisor/streams/[id]/__tests__/routes.test.ts` | web route tests | Create |

---

## Task 1: DB row access layer (`streamSpecsLoader.ts`)

**Files:**
- Modify: `scripts/streamlink-supervisor/streamSpecsLoader.ts`
- Test: `scripts/streamlink-supervisor/__tests__/streamSpecsLoader.test.ts`

- [ ] **Step 1: Write failing tests for the new exports**

Append to `scripts/streamlink-supervisor/__tests__/streamSpecsLoader.test.ts`:

```typescript
import { loadStreamSpec, loadStreamRows, assertSafeTableName, rowToSpec } from '../streamSpecsLoader';

describe('assertSafeTableName', () => {
  it('accepts a valid event table name', () => {
    expect(() => assertSafeTableName('streams_2026_summer_sat')).not.toThrow();
  });
  it('throws on an injection attempt', () => {
    expect(() => assertSafeTableName('streams; DROP TABLE teams;--')).toThrow(/invalid table name/i);
  });
});

describe('rowToSpec', () => {
  it('maps a row to a StreamSpec with a deterministic relay port', () => {
    expect(rowToSpec({ id: 7, obs_source_name: 'team_x', url: 'https://twitch.tv/x' })).toEqual({
      streamId: 'team_x',
      upstreamUrl: 'https://twitch.tv/x',
      port: relayPort(7),
    });
  });
});

describe('loadStreamRows', () => {
  it('selects the disabled column set and returns raw rows', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([
        { id: 1, obs_source_name: 'a', url: 'https://twitch.tv/a', disabled: 0 },
        { id: 2, obs_source_name: 'b', url: 'https://twitch.tv/b', disabled: 1 },
      ]),
    };
    const rows = await loadStreamRows({ db, tableName: 'streams_2026_summer_sat' });
    expect(db.all).toHaveBeenCalledWith('SELECT id, obs_source_name, url, disabled FROM streams_2026_summer_sat');
    expect(rows.map(r => r.obs_source_name)).toEqual(['a', 'b']);
  });
});

describe('loadStreamSpec', () => {
  it('loads one stream by obs_source_name (parameterized) and maps it', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([{ id: 4, obs_source_name: 'team_q', url: 'https://twitch.tv/q', disabled: 0 }]),
    };
    const spec = await loadStreamSpec({ db, tableName: 'streams_2026_summer_sat' }, 'team_q');
    expect(db.all).toHaveBeenCalledWith(
      'SELECT id, obs_source_name, url, disabled FROM streams_2026_summer_sat WHERE obs_source_name = ?',
      'team_q'
    );
    expect(spec).toEqual({ streamId: 'team_q', upstreamUrl: 'https://twitch.tv/q', port: relayPort(4) });
  });

  it('loads a disabled stream too (Start re-enables it)', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([{ id: 4, obs_source_name: 'team_q', url: 'https://twitch.tv/q', disabled: 1 }]),
    };
    const spec = await loadStreamSpec({ db, tableName: 'streams_2026_summer_sat' }, 'team_q');
    expect(spec?.streamId).toBe('team_q');
  });

  it('returns null when no row matches', async () => {
    const db = { all: jest.fn().mockResolvedValue([]) };
    const spec = await loadStreamSpec({ db, tableName: 'streams_2026_summer_sat' }, 'ghost');
    expect(spec).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new tests, verify they fail**

Run: `npx jest scripts/streamlink-supervisor/__tests__/streamSpecsLoader.test.ts -t "loadStreamSpec|loadStreamRows|assertSafeTableName|rowToSpec"`
Expected: FAIL — `loadStreamSpec`/`loadStreamRows`/`assertSafeTableName`/`rowToSpec` are not exported.

- [ ] **Step 3: Rewrite `streamSpecsLoader.ts`**

Replace the whole file with:

```typescript
import { StreamSpec } from './supervisor';
import { relayPort } from '../../lib/relayPort';

export interface MinimalDb {
  all<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<void>;
}

export interface LoadStreamSpecsOptions {
  db: MinimalDb;
  tableName: string;
}

export interface StreamRow {
  id?: number;
  obs_source_name?: string;
  url?: string;
  // 1 = operator-stopped (skip); 0/null/undefined = enabled. Absent on legacy
  // DBs that predate scripts/addDisabledToStreams.ts — treated as enabled.
  disabled?: number | null;
}

// Table names are interpolated (sqlite identifiers can't be parameterized).
// Restrict to the shape generated by lib/constants.ts getTableName():
// <base>_<year>_<season>[_<suffix>] — letters, digits, underscores only.
const SAFE_TABLE_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function assertSafeTableName(tableName: string): void {
  if (!SAFE_TABLE_NAME.test(tableName)) {
    throw new Error(`invalid table name: ${tableName}`);
  }
}

export function isValidRow(r: StreamRow): boolean {
  return Number.isInteger(r.id) && (r.id as number) > 0
    && typeof r.obs_source_name === 'string' && r.obs_source_name.length > 0
    && typeof r.url === 'string' && r.url.length > 0;
}

export function rowToSpec(r: StreamRow): StreamSpec {
  return {
    streamId: r.obs_source_name!,
    upstreamUrl: r.url!,
    // Deterministic port shared with the webui ffmpeg_source input.
    port: relayPort(r.id!),
  };
}

// Raw rows for the whole table. Prefer the `disabled` column; fall back to the
// legacy column set on DBs predating the migration (every row then enabled).
export async function loadStreamRows(opts: LoadStreamSpecsOptions): Promise<StreamRow[]> {
  assertSafeTableName(opts.tableName);
  try {
    return await opts.db.all<StreamRow>(
      `SELECT id, obs_source_name, url, disabled FROM ${opts.tableName}`
    );
  } catch {
    return await opts.db.all<StreamRow>(
      `SELECT id, obs_source_name, url FROM ${opts.tableName}`
    );
  }
}

// Enabled, valid specs only — this is what makes "Stop" durable (disabled rows
// are excluded from the supervised set on startup AND reload).
export async function loadStreamSpecs(opts: LoadStreamSpecsOptions): Promise<StreamSpec[]> {
  const rows = await loadStreamRows(opts);
  return rows.filter(r => isValidRow(r) && !r.disabled).map(rowToSpec);
}

// One stream by obs_source_name, regardless of `disabled` (Start re-enables it).
// Returns null if there's no valid matching row.
export async function loadStreamSpec(
  opts: LoadStreamSpecsOptions,
  streamId: string
): Promise<StreamSpec | null> {
  assertSafeTableName(opts.tableName);
  let rows: StreamRow[];
  try {
    rows = await opts.db.all<StreamRow>(
      `SELECT id, obs_source_name, url, disabled FROM ${opts.tableName} WHERE obs_source_name = ?`,
      streamId
    );
  } catch {
    rows = await opts.db.all<StreamRow>(
      `SELECT id, obs_source_name, url FROM ${opts.tableName} WHERE obs_source_name = ?`,
      streamId
    );
  }
  const row = rows[0];
  if (!row || !isValidRow(row)) return null;
  return rowToSpec(row);
}
```

- [ ] **Step 4: Run the full loader test file, verify all pass**

Run: `npx jest scripts/streamlink-supervisor/__tests__/streamSpecsLoader.test.ts`
Expected: PASS (existing `loadStreamSpecs` tests + new ones). The pre-existing tests still assert `all` called with `'SELECT id, obs_source_name, url, disabled FROM ...'` — unchanged because `loadStreamRows` issues that exact query.

- [ ] **Step 5: Commit**

```bash
git add scripts/streamlink-supervisor/streamSpecsLoader.ts scripts/streamlink-supervisor/__tests__/streamSpecsLoader.test.ts
git commit -m "feat(supervisor): add run() to MinimalDb + single-stream + raw-row loaders"
```

---

## Task 2: WAL + busy_timeout on the web/tsx DB handle (`lib/database.ts`)

**Files:**
- Modify: `lib/database.ts:54-58`
- Test: `lib/__tests__/database.wal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/database.wal.test.ts`:

```typescript
import os from 'os';
import path from 'path';
import fs from 'fs';

describe('getDatabase concurrency pragmas', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('opens the connection in WAL mode with a busy timeout', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuesheet-wal-'));
    process.env.FILE_DIRECTORY = dir;

    const { getDatabase } = await import('../database');
    const db = await getDatabase();

    const journal = await db.get<{ journal_mode: string }>('PRAGMA journal_mode');
    expect(journal?.journal_mode.toLowerCase()).toBe('wal');

    const timeout = await db.get<{ timeout: number }>('PRAGMA busy_timeout');
    expect(timeout?.timeout).toBeGreaterThanOrEqual(1);

    await db.close();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest lib/__tests__/database.wal.test.ts`
Expected: FAIL — `journal_mode` is `delete` (default rollback journal), not `wal`.

- [ ] **Step 3: Add the pragmas in `getDatabase`**

In `lib/database.ts`, replace the `db = await open({...})` block (lines 54-58) with:

```typescript
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    // WAL lets the web app and the streamlink supervisor read/write sources.db
    // concurrently (two processes). WAL is a persistent property of the DB file
    // (set once, idempotent); busy_timeout is per-connection and must be set on
    // every opener. WAL requires a LOCAL filesystem — keep FILE_DIRECTORY local.
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA busy_timeout = 5000;');
    console.log('Database connection established.');
```

(Remove the now-duplicate `console.log('Database connection established.');` on the old line 58 — it's moved into the block above.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest lib/__tests__/database.wal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/database.ts lib/__tests__/database.wal.test.ts
git commit -m "feat(db): open sources.db in WAL mode with busy_timeout for multi-process access"
```

---

## Task 3: Supervisor HTTP routes — start/stop/listAll (`healthServer.ts`)

**Files:**
- Modify: `scripts/streamlink-supervisor/healthServer.ts`
- Test: `scripts/streamlink-supervisor/__tests__/healthServer.test.ts`

- [ ] **Step 1: Write failing tests for the new routes**

Append inside the top-level `describe('handleHealthRequest', ...)` block in `scripts/streamlink-supervisor/__tests__/healthServer.test.ts` (before its closing `});`):

```typescript
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
```

- [ ] **Step 2: Run, verify failure**

Run: `npx jest scripts/streamlink-supervisor/__tests__/healthServer.test.ts -t "start and /stop|GET /streams"`
Expected: FAIL — routes not implemented; `onStart`/`onStop`/`listAll` not in the context type.

- [ ] **Step 3: Add the `DashboardStream` type and route handling**

In `scripts/streamlink-supervisor/healthServer.ts`:

(a) After the `ReloadResult` interface (line 18), add:

```typescript
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
```

(b) Extend `HealthRequestContext` (after `onRestart?` at line 28):

```typescript
  // Durably start/stop a single stream (flip `disabled`, then start/stop the
  // pipeline). Async because they write the DB. false => unknown streamId (404).
  onStart?: (streamId: string) => Promise<boolean>;
  onStop?: (streamId: string) => Promise<boolean>;
  // DB-backed list of ALL streams merged with live supervised status, so the
  // dashboard can show stopped streams (and host a Start button on them).
  listAll?: () => Promise<DashboardStream[]>;
```

(c) Add the route handlers. Immediately AFTER the `restartMatch` block (after line 103) and BEFORE the `if (url !== '/health')` check, insert:

```typescript
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
    const streamId = decodeURIComponent((startMatch ?? stopMatch)![1]);
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
```

(d) Extend `StartHealthServerOptions` (after `onRestart?` at line 130):

```typescript
  onStart?: (streamId: string) => Promise<boolean>;
  onStop?: (streamId: string) => Promise<boolean>;
  listAll?: () => Promise<DashboardStream[]>;
```

(e) Pass them through in `startHealthServer`'s `ctx` object (after `onRestart: opts.onRestart,` at line 138):

```typescript
    onStart: opts.onStart,
    onStop: opts.onStop,
    listAll: opts.listAll,
```

- [ ] **Step 4: Run the health server tests, verify pass**

Run: `npx jest scripts/streamlink-supervisor/__tests__/healthServer.test.ts`
Expected: PASS (existing + new). Note: the existing test "returns 404 for any other path" uses `GET /streams` to assert 404 — **update it** to a path that's still unmapped, e.g. change `makeReq('GET', '/streams')` to `makeReq('GET', '/nope')` on line 101.

- [ ] **Step 5: Commit**

```bash
git add scripts/streamlink-supervisor/healthServer.ts scripts/streamlink-supervisor/__tests__/healthServer.test.ts
git commit -m "feat(supervisor): add /streams list + /streams/{id}/start|stop HTTP routes"
```

---

## Task 4: Runtime wiring (`runtime.ts`)

**Files:**
- Modify: `scripts/streamlink-supervisor/runtime.ts`
- Test: `scripts/streamlink-supervisor/__tests__/runtime.control.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `scripts/streamlink-supervisor/__tests__/runtime.control.test.ts`:

```typescript
import { startRuntime } from '../runtime';

// Minimal spawn stub: returns a fake child that never exits, so pipelines stay
// "running" and the runtime doesn't try to spawn real streamlink/ffmpeg.
function fakeSpawn() {
  const child: any = {
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    on: () => {},
    kill: () => {},
    killed: false,
    pid: 1234,
  };
  return child;
}

describe('startRuntime control closures', () => {
  const tableName = 'streams_2026_summer_sat';

  function makeDb(rows: any[]) {
    const run = jest.fn().mockResolvedValue(undefined);
    const db = {
      all: jest.fn().mockImplementation(async (sql: string, ...params: unknown[]) => {
        if (sql.includes('WHERE obs_source_name = ?')) {
          return rows.filter(r => r.obs_source_name === params[0]);
        }
        return rows;
      }),
      run,
    };
    return { db, run };
  }

  it('onStop writes disabled=1 then stops the stream; unknown id => false', async () => {
    const rows = [{ id: 1, obs_source_name: 'team_a', url: 'https://twitch.tv/a', disabled: 0 }];
    const { db, run } = makeDb(rows);
    const rt = await startRuntime({
      db, tableName, spawn: fakeSpawn as never,
      ports: { basePort: 9001, max: 8 }, healthPort: 0, logDir: './logs/test',
    });

    const ok = await (rt as any).onStop('team_a');
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledWith(
      `UPDATE ${tableName} SET disabled = 1 WHERE obs_source_name = ?`, 'team_a'
    );
    expect(rt.supervisor.list().map(s => s.streamId)).not.toContain('team_a');

    const missing = await (rt as any).onStop('ghost');
    expect(missing).toBe(false);

    await rt.shutdown();
  });

  it('onStart writes disabled=0 then starts the stream', async () => {
    const rows = [{ id: 2, obs_source_name: 'team_b', url: 'https://twitch.tv/b', disabled: 1 }];
    const { db, run } = makeDb(rows);
    const rt = await startRuntime({
      db, tableName, spawn: fakeSpawn as never,
      ports: { basePort: 9001, max: 8 }, healthPort: 0, logDir: './logs/test',
    });
    // disabled=1 → not supervised at boot
    expect(rt.supervisor.list().map(s => s.streamId)).not.toContain('team_b');

    const ok = await (rt as any).onStart('team_b');
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledWith(
      `UPDATE ${tableName} SET disabled = 0 WHERE obs_source_name = ?`, 'team_b'
    );
    expect(rt.supervisor.list().map(s => s.streamId)).toContain('team_b');

    await rt.shutdown();
  });

  it('listAll merges DB rows with live status; stopped rows get relayPort + status=stopped', async () => {
    const rows = [
      { id: 1, obs_source_name: 'team_a', url: 'https://twitch.tv/a', disabled: 0 },
      { id: 9, obs_source_name: 'team_off', url: 'https://twitch.tv/off', disabled: 1 },
    ];
    const { db } = makeDb(rows);
    const rt = await startRuntime({
      db, tableName, spawn: fakeSpawn as never,
      ports: { basePort: 9001, max: 8 }, healthPort: 0, logDir: './logs/test',
    });
    const list = await (rt as any).listAll();
    const off = list.find((s: any) => s.streamId === 'team_off');
    expect(off.status).toBe('stopped');
    expect(off.disabled).toBe(1);
    const a = list.find((s: any) => s.streamId === 'team_a');
    expect(a.status).toBe('running');
    await rt.shutdown();
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx jest scripts/streamlink-supervisor/__tests__/runtime.control.test.ts`
Expected: FAIL — `onStart`/`onStop`/`listAll` are not on the runtime object.

- [ ] **Step 3: Implement the closures in `runtime.ts`**

(a) Update imports (line 7):

```typescript
import { loadStreamSpecs, loadStreamSpec, loadStreamRows, isValidRow, assertSafeTableName, MinimalDb } from './streamSpecsLoader';
import { relayPort } from '../../lib/relayPort';
```

(b) Extend `SupervisorRuntime` (after `reload:` at line 29):

```typescript
  onStart: (streamId: string) => Promise<boolean>;
  onStop: (streamId: string) => Promise<boolean>;
  listAll: () => Promise<DashboardStream[]>;
```

…and import the type at the top (line 5 area):

```typescript
import { startHealthServer, DashboardStream } from './healthServer';
```

(c) After the `reload` definition (after line 80), add:

```typescript
  // Durable Start: enable the row, then start the (single) stream in place.
  // start() guards double-start, so re-clicking is safe. Returns false for an
  // unknown streamId (=> 404). DB write first; the flag is authoritative.
  const onStart = async (streamId: string): Promise<boolean> => {
    assertSafeTableName(opts.tableName);
    const spec = await loadStreamSpec({ db: opts.db, tableName: opts.tableName }, streamId);
    if (!spec) return false;
    await opts.db.run(
      `UPDATE ${opts.tableName} SET disabled = 0 WHERE obs_source_name = ?`,
      streamId
    );
    supervisor.start(spec);
    return true;
  };

  // Durable Stop: disable the row, then stop the pipeline (no-op if not running).
  const onStop = async (streamId: string): Promise<boolean> => {
    assertSafeTableName(opts.tableName);
    const spec = await loadStreamSpec({ db: opts.db, tableName: opts.tableName }, streamId);
    if (!spec) return false;
    await opts.db.run(
      `UPDATE ${opts.tableName} SET disabled = 1 WHERE obs_source_name = ?`,
      streamId
    );
    supervisor.stop(streamId);
    return true;
  };

  // DB-backed list of ALL streams merged with live supervised state. A stopped
  // row isn't in supervisor.list(), so its eventual port is derived via
  // relayPort(id) and its status is 'stopped'.
  const listAll = async (): Promise<DashboardStream[]> => {
    const rows = await loadStreamRows({ db: opts.db, tableName: opts.tableName });
    const live = new Map(supervisor.list().map(s => [s.streamId, s]));
    return rows.filter(isValidRow).map(row => {
      const s = live.get(row.obs_source_name!);
      return {
        streamId: row.obs_source_name!,
        url: row.url!,
        disabled: row.disabled ? 1 : 0,
        status: s ? s.status : 'stopped',
        port: s ? s.port : relayPort(row.id!),
        restartCount: s ? s.restartCount : 0,
        lastExitCode: s ? s.lastExitCode : null,
        lastExitSource: s ? s.lastExitSource : null,
      };
    });
  };
```

(d) Pass them into `startHealthServer` (after `onRestart:` at line 88):

```typescript
    onStart,
    onStop,
    listAll,
```

(e) Return them in the runtime object (the final `return { supervisor, server, reload, shutdown };` at line 101):

```typescript
  return { supervisor, server, reload, shutdown, onStart, onStop, listAll };
```

- [ ] **Step 4: Run, verify pass**

Run: `npx jest scripts/streamlink-supervisor/__tests__/runtime.control.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/streamlink-supervisor/runtime.ts scripts/streamlink-supervisor/__tests__/runtime.control.test.ts
git commit -m "feat(supervisor): wire durable onStart/onStop + DB-backed listAll into runtime"
```

---

## Task 5: Supervisor client helpers (`supervisorClient.ts`)

**Files:**
- Modify: `lib/supervisorClient.ts`
- Test: `lib/__tests__/supervisorClient.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/supervisorClient.test.ts`:

```typescript
import { requestSupervisorStart, requestSupervisorStop } from '../supervisorClient';

describe('requestSupervisorStart/Stop', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns { reachable: true, ok: true } on a 200 from the supervisor', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await requestSupervisorStop('team_a');
    expect(result).toEqual({ reachable: true, ok: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/streams/team_a/stop',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns { reachable: true, ok: false } on a 404', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));
    const result = await requestSupervisorStart('ghost');
    expect(result).toEqual({ reachable: true, ok: false });
  });

  it('returns { reachable: false, ok: false } when fetch throws (supervisor down)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await requestSupervisorStart('team_a');
    expect(result).toEqual({ reachable: false, ok: false });
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx jest lib/__tests__/supervisorClient.test.ts`
Expected: FAIL — `requestSupervisorStart`/`requestSupervisorStop` not exported.

- [ ] **Step 3: Add the helpers**

In `lib/supervisorClient.ts`, after the `requestSupervisorRestart` function (after line 78), add:

```typescript
export interface SupervisorControlResult {
  // false => could not reach the supervisor at all (use the break-glass path).
  reachable: boolean;
  // true => the supervisor returned a 2xx for the action.
  ok: boolean;
}

async function postControl(streamId: string, action: 'start' | 'stop'): Promise<SupervisorControlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELOAD_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${SUPERVISOR_URL}/streams/${encodeURIComponent(streamId)}/${action}`,
      { method: 'POST', signal: controller.signal }
    );
    if (!res.ok) {
      console.warn(`[supervisorClient] ${action} ${streamId} returned ${res.status}`);
    }
    return { reachable: true, ok: res.ok };
  } catch (err) {
    console.warn(
      `[supervisorClient] ${action} unreachable — ${err instanceof Error ? err.message : String(err)}`
    );
    return { reachable: false, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Durably start a single stream via the supervisor (POST /streams/{id}/start). */
export async function requestSupervisorStart(streamId: string): Promise<SupervisorControlResult> {
  return postControl(streamId, 'start');
}

/** Durably stop a single stream via the supervisor (POST /streams/{id}/stop). */
export async function requestSupervisorStop(streamId: string): Promise<SupervisorControlResult> {
  return postControl(streamId, 'stop');
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx jest lib/__tests__/supervisorClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/supervisorClient.ts lib/__tests__/supervisorClient.test.ts
git commit -m "feat(supervisorClient): add start/stop control helpers with reachable/ok result"
```

---

## Task 6: Web routes — forward + break-glass

**Files:**
- Rewrite: `app/api/supervisor/streams/[id]/stop/route.ts`, `app/api/supervisor/streams/[id]/start/route.ts`
- Modify: `app/api/supervisor/streams/[id]/restart/route.ts` (no behavior change; comment only)
- Test: `app/api/supervisor/streams/[id]/__tests__/routes.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `app/api/supervisor/streams/[id]/__tests__/routes.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { POST as stopPOST } from '../stop/route';

const mockGet = jest.fn();
const mockRun = jest.fn();
jest.mock('../../../../../../lib/database', () => ({
  getDatabase: async () => ({ get: mockGet, run: mockRun }),
}));

const mockRequestStop = jest.fn();
jest.mock('../../../../../../lib/supervisorClient', () => ({
  requestSupervisorStop: (...a: unknown[]) => mockRequestStop(...a),
  requestSupervisorStart: jest.fn(),
}));

const fakeReq = {} as any;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('POST /api/supervisor/streams/[id]/stop', () => {
  beforeEach(() => { mockGet.mockReset(); mockRun.mockReset(); mockRequestStop.mockReset(); });

  it('404 when the stream id is unknown', async () => {
    mockGet.mockResolvedValue(undefined);
    const res = await stopPOST(fakeReq, params('999'));
    expect(res.status).toBe(404);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('forwards to supervisor and does NOT write the DB when reachable', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestStop.mockResolvedValue({ reachable: true, ok: true });
    const res = await stopPOST(fakeReq, params('1'));
    expect(mockRequestStop).toHaveBeenCalledWith('team_a');
    expect(mockRun).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: '1', action: 'stop' });
  });

  it('break-glass: writes disabled=1 + degraded when supervisor unreachable', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestStop.mockResolvedValue({ reachable: false, ok: false });
    const res = await stopPOST(fakeReq, params('1'));
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('SET disabled = 1 WHERE id = ?'), ['1']
    );
    const body = await res.json();
    expect(body).toEqual({ success: true, id: '1', action: 'stop', degraded: true });
  });

  it('502 when supervisor is reachable but rejects', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestStop.mockResolvedValue({ reachable: true, ok: false });
    const res = await stopPOST(fakeReq, params('1'));
    expect(res.status).toBe(502);
    expect(mockRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx jest app/api/supervisor/streams/[id]/__tests__/routes.test.ts`
Expected: FAIL — current `stop/route.ts` writes the DB unconditionally and calls `requestSupervisorReload`, so assertions about forwarding/break-glass/502 fail.

- [ ] **Step 3: Rewrite `stop/route.ts`**

Replace `app/api/supervisor/streams/[id]/stop/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../../lib/database';
import { TABLE_NAMES } from '../../../../../../lib/constants';
import { requestSupervisorStop } from '../../../../../../lib/supervisorClient';

// POST /api/supervisor/streams/{id}/stop
// Forwards to the supervisor, which owns the durable `disabled` write. If the
// supervisor is unreachable, break-glass: persist disabled=1 here so the next
// reconcile applies it (UI labels this "supervisor offline").
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDatabase();

    const stream = await db.get<{ obs_source_name: string }>(
      `SELECT obs_source_name FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`,
      [id]
    );
    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    const result = await requestSupervisorStop(stream.obs_source_name);

    if (result.reachable && result.ok) {
      return NextResponse.json({ success: true, id, action: 'stop' });
    }
    if (result.reachable && !result.ok) {
      return NextResponse.json(
        { error: 'Supervisor rejected the stop request' },
        { status: 502 }
      );
    }

    // Break-glass: supervisor unreachable — persist intent for the next reconcile.
    await db.run(`UPDATE ${TABLE_NAMES.STREAMS} SET disabled = 1 WHERE id = ?`, [id]);
    return NextResponse.json({ success: true, id, action: 'stop', degraded: true });
  } catch (error) {
    console.error('Error stopping stream:', error);
    return NextResponse.json({ error: 'Failed to stop stream' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Rewrite `start/route.ts`**

Replace `app/api/supervisor/streams/[id]/start/route.ts` with the symmetric version:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../../lib/database';
import { TABLE_NAMES } from '../../../../../../lib/constants';
import { requestSupervisorStart } from '../../../../../../lib/supervisorClient';

// POST /api/supervisor/streams/{id}/start
// Forwards to the supervisor, which owns the durable `disabled` write. If the
// supervisor is unreachable, break-glass: persist disabled=0 here so the next
// reconcile starts it (UI labels this "supervisor offline").
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDatabase();

    const stream = await db.get<{ obs_source_name: string }>(
      `SELECT obs_source_name FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`,
      [id]
    );
    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    const result = await requestSupervisorStart(stream.obs_source_name);

    if (result.reachable && result.ok) {
      return NextResponse.json({ success: true, id, action: 'start' });
    }
    if (result.reachable && !result.ok) {
      return NextResponse.json(
        { error: 'Supervisor rejected the start request' },
        { status: 502 }
      );
    }

    // Break-glass: supervisor unreachable — persist intent for the next reconcile.
    await db.run(`UPDATE ${TABLE_NAMES.STREAMS} SET disabled = 0 WHERE id = ?`, [id]);
    return NextResponse.json({ success: true, id, action: 'start', degraded: true });
  } catch (error) {
    console.error('Error starting stream:', error);
    return NextResponse.json({ error: 'Failed to start stream' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Update the `restart/route.ts` comment**

In `app/api/supervisor/streams/[id]/restart/route.ts`, the behavior is unchanged (restart needs no DB write). Update the top comment to note the new sibling shape (lines 6-9):

```typescript
// POST /api/supervisor/streams/{id}/restart
// Restarts a running/escalated stream in place via the supervisor. No DB change
// (restart only applies to a supervised stream). The supervisor keys on
// obs_source_name, resolved here from the numeric id. Sibling start/stop routes
// own the durable `disabled` write (forwarded to the supervisor).
```

- [ ] **Step 6: Run the route tests, verify pass**

Run: `npx jest app/api/supervisor/streams/[id]/__tests__/routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/supervisor/streams
git commit -m "feat(api): forward stream control to supervisor with break-glass DB fallback"
```

---

## Task 7: bun:sqlite type shim (`bun-shims.d.ts`)

**Files:**
- Modify: `src/cli/types/bun-shims.d.ts`

- [ ] **Step 1: Extend the shim**

Replace the `declare module 'bun:sqlite' { ... }` block (lines 10-19) with:

```typescript
declare module 'bun:sqlite' {
  export interface Statement {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  }
  export class Database {
    constructor(filename: string, options?: { readonly?: boolean; create?: boolean });
    query(sql: string): Statement;
    run(sql: string, ...params: unknown[]): unknown;
    exec(sql: string): void;
    close(): void;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (the shim compiles; it is referenced by the bun command files which are excluded from tsc, so this only widens the declared surface).

- [ ] **Step 3: Commit**

```bash
git add src/cli/types/bun-shims.d.ts
git commit -m "chore(types): widen bun:sqlite shim with run()/exec() for RW access"
```

---

## Task 8: Shared RW bun opener + wire both bun entrypoints

**Files:**
- Create: `scripts/streamlink-supervisor/bunDatabase.ts`
- Modify: `scripts/streamlink-supervisor/index.bun.ts`, `src/cli/commands/supervisor.bun.ts`

> **Note:** these files import `bun:sqlite` and are excluded from `tsc` and from Jest (they only run under Bun). There is no unit test here; correctness is verified by the binary smoke test in Task 12. This is the BLOCKING fix from the review — BOTH bun entrypoints must use the shared RW opener or the shipped `cuesheet` binary stays read-only.

- [ ] **Step 1: Create the shared opener**

Create `scripts/streamlink-supervisor/bunDatabase.ts`:

```typescript
/**
 * Shared read-WRITE bun:sqlite handle for the supervisor, adapted to MinimalDb.
 *
 * BUN-ONLY (imports bun:sqlite); excluded from tsc + Jest. Imported by BOTH
 * compiled entrypoints — scripts/streamlink-supervisor/index.bun.ts and
 * src/cli/commands/supervisor.bun.ts — so they cannot drift. The supervisor now
 * owns the durable `disabled` write, so the handle is read-write; WAL +
 * busy_timeout let it share sources.db with the web app's sqlite3 handle.
 * WAL requires a LOCAL filesystem for FILE_DIRECTORY.
 */
import path from 'node:path';
import { Database as BunDatabase } from 'bun:sqlite';
import type { MinimalDb } from './streamSpecsLoader';

export function openBunDatabase(fileDirectory: string): MinimalDb {
  const dbPath = path.join(path.resolve(fileDirectory), 'sources.db');
  const sqlite = new BunDatabase(dbPath); // read-write (bun:sqlite default)
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA busy_timeout = 5000');
  sqlite.exec('PRAGMA wal_autocheckpoint = 1000');
  return {
    async all<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
      return sqlite.query(sql).all(...params) as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<void> {
      sqlite.run(sql, ...params);
    },
  };
}
```

- [ ] **Step 2: Wire `scripts/streamlink-supervisor/index.bun.ts`**

In `scripts/streamlink-supervisor/index.bun.ts`:
- Replace the `import { Database as BunDatabase } from 'bun:sqlite';` line (line 30) with:
  ```typescript
  import { openBunDatabase } from './bunDatabase';
  ```
- Delete the local `openDatabase()` function (lines 56-65).
- Replace `const db = openDatabase();` (line 68) with:
  ```typescript
  const db = openBunDatabase(path.resolve(process.env.FILE_DIRECTORY || './files'));
  ```
- Update the file-header comment (lines 13-16) — change the "read-only handle is enough" sentence to:
  ```
   *      The supervisor now owns the durable `disabled` write, so the handle is
   *      read-write (WAL + busy_timeout) via the shared openBunDatabase helper.
  ```

- [ ] **Step 3: Wire `src/cli/commands/supervisor.bun.ts`**

In `src/cli/commands/supervisor.bun.ts`:
- Replace `import { Database as BunDatabase } from 'bun:sqlite';` (line 19) with:
  ```typescript
  import { openBunDatabase } from '../../../scripts/streamlink-supervisor/bunDatabase.js';
  ```
- Delete the local `openDatabase()` function (lines 41-54).
- Replace `const db = openDatabase(fileDirectory);` (line 69) with:
  ```typescript
  const db = openBunDatabase(fileDirectory);
  ```
- Update the header comment (lines 42-45 region) to state the handle is now read-write via the shared helper.

- [ ] **Step 4: Type-check (shim + non-bun files only)**

Run: `npm run type-check`
Expected: PASS. (`tsc` excludes the `.bun.ts` files; this confirms nothing else regressed.)

- [ ] **Step 5: Commit**

```bash
git add scripts/streamlink-supervisor/bunDatabase.ts scripts/streamlink-supervisor/index.bun.ts src/cli/commands/supervisor.bun.ts
git commit -m "feat(supervisor): open sources.db read-write via one shared bun opener (both binaries)"
```

---

## Task 9: Dashboard controls + colorblind glyphs (`dashboard.html`)

**Files:**
- Modify: `scripts/streamlink-supervisor/dashboard.html`

> No Jest (static asset). Verified manually + by the binary smoke (Task 12).

- [ ] **Step 1: Add an Actions column header**

In the `<thead>` (lines 130-137), add a fourth/fifth header. Replace the `<tr>` with:

```html
        <tr>
          <th style="width: 30%">Stream</th>
          <th style="width: 18%">Status</th>
          <th style="width: 12%">Restarts</th>
          <th style="width: 18%">OBS input URL</th>
          <th style="width: 22%">Actions</th>
        </tr>
```

- [ ] **Step 2: Add status glyphs + a button style (colorblind-safe)**

In the `<style>` block, after the `.dot` rules (line 106), add:

```css
    .glyph { font-weight: 700; margin-right: 6px; }
    .status-cell { white-space: nowrap; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .btn {
      font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 4px;
      border: 1px solid var(--panel-border); background: #1f2530; color: var(--fg);
      cursor: pointer;
    }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn:hover:not(:disabled) { border-color: var(--link); }
```

- [ ] **Step 3: Switch polling to `GET /streams` and render controls**

Replace the entire `<script>` body (lines 143-209) with:

```html
  <script>
  (function () {
    const overallEl = document.getElementById("overall");
    const lastUpdateEl = document.getElementById("last-update");
    const rowsEl = document.getElementById("rows");

    // Non-color status cue (glyph + word) so state is readable without relying
    // on hue. ● running / ▲ crashed / ■ stopped.
    const GLYPH = { running: "●", escalated: "▲", stopped: "■" };
    const LABEL = { running: "running", escalated: "crashed", stopped: "stopped" };

    function fmtTime(d) {
      const pad = n => String(n).padStart(2, "0");
      return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      })[c]);
    }
    function renderUnreachable(detail) {
      overallEl.dataset.state = "unreachable";
      overallEl.textContent = "unreachable";
      rowsEl.innerHTML = '<tr><td colspan="5" class="empty">Supervisor not responding' +
        (detail ? ' — ' + escapeHtml(detail) : "") + '. Retrying.</td></tr>';
    }

    async function control(streamId, action) {
      if ((action === "stop" || action === "restart") &&
          !confirm(`${action[0].toUpperCase() + action.slice(1)} "${streamId}"?`)) return;
      try {
        const res = await fetch("/streams/" + encodeURIComponent(streamId) + "/" + action, { method: "POST" });
        if (!res.ok) alert(action + " failed: HTTP " + res.status);
      } catch (e) {
        alert(action + " failed: " + (e && e.message ? e.message : e));
      }
      pollStreams();
    }
    window.__control = control; // referenced by inline onclick handlers

    function renderStreams(streams) {
      if (!streams.length) {
        rowsEl.innerHTML = '<tr><td colspan="5" class="empty">No streams configured.</td></tr>';
        return;
      }
      const anyCrashed = streams.some(s => s.status === "escalated");
      overallEl.dataset.state = anyCrashed ? "degraded" : "ok";
      overallEl.textContent = anyCrashed ? "degraded" : "ok";

      rowsEl.innerHTML = streams.map(s => {
        const status = String(s.status || "stopped");
        const glyph = GLYPH[status] || "■";
        const label = LABEL[status] || status;
        const restarts = Number(s.restartCount || 0);
        const alert = restarts >= 3 || status === "escalated" ? " alert" : "";
        const id = escapeHtml(s.streamId);
        const live = status === "running" || status === "escalated";
        const exit = s.lastExitCode != null
          ? ` (exit ${escapeHtml(s.lastExitCode)}${s.lastExitSource ? " / " + escapeHtml(s.lastExitSource) : ""})`
          : "";
        return '<tr>' +
          '<td>' + id + '</td>' +
          '<td class="status-cell"><span class="glyph">' + glyph + '</span>' + label + escapeHtml(exit) + '</td>' +
          '<td class="restarts' + alert + '">' + restarts + '</td>' +
          '<td class="url">' + escapeHtml(s.port ? ("udp://127.0.0.1:" + s.port) : "") + '</td>' +
          '<td class="actions">' +
            '<button class="btn" ' + (live ? "disabled" : "") + ' onclick="__control(\'' + id + '\',\'start\')">Start</button>' +
            '<button class="btn" ' + (live ? "" : "disabled") + ' onclick="__control(\'' + id + '\',\'stop\')">Stop</button>' +
            '<button class="btn" ' + (live ? "" : "disabled") + ' onclick="__control(\'' + id + '\',\'restart\')">Restart</button>' +
          '</td>' +
        '</tr>';
      }).join("");
    }

    async function pollStreams() {
      try {
        const res = await fetch("/streams", { cache: "no-store" });
        if (!res.ok) { renderUnreachable("HTTP " + res.status); return; }
        const body = await res.json();
        lastUpdateEl.textContent = fmtTime(new Date());
        renderStreams(Array.isArray(body.streams) ? body.streams : []);
      } catch (err) {
        renderUnreachable(err && err.message ? err.message : String(err));
      }
    }

    pollStreams();
    // Heavier DB-backed list polls less often than the old 1s /health pill to
    // avoid a per-second full-table read on the always-on supervisor.
    setInterval(pollStreams, 3000);
  })();
  </script>
```

- [ ] **Step 4: Update the "Polling every 1 s" meta text**

In the `#meta` block (line 125), change `Polling every 1 s` to `Polling every 3 s`.

- [ ] **Step 5: Manual verification**

(Deferred to Task 12's end-to-end pass — the dashboard is served by the running supervisor.) Verify each row shows a glyph (`●`/`▲`/`■`) + word, three buttons enabled by status, and a confirm on Stop/Restart.

- [ ] **Step 6: Commit**

```bash
git add scripts/streamlink-supervisor/dashboard.html
git commit -m "feat(dashboard): add start/stop/restart controls + colorblind status glyphs"
```

---

## Task 10: Web page — drop optimistic write, surface `degraded` (`page.tsx`)

**Files:**
- Modify: `app/streams/page.tsx`

> Client component; verified by type-check + Task 12 manual pass.

- [ ] **Step 1: Replace the optimistic `disabled` write with poll-driven status + degraded toast**

In `app/streams/page.tsx`, in `runControlAction` (the success branch, lines 394-411), replace:

```typescript
        if (res.ok) {
          if (action === 'restart' && data.restarted === false) {
            showError(
              'Restart Incomplete',
              `"${stream.name}" was not restarted — it may be stopped or the supervisor is unreachable.`
            );
          } else {
            const verb = action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Restarted';
            showSuccess(`Stream ${verb}`, `"${stream.name}" has been ${verb.toLowerCase()}.`);
          }
          // Optimistically reflect the durable flag locally so the buttons
          // update immediately, then re-poll for authoritative status.
          if (action === 'start' || action === 'stop') {
            setStreams(prev =>
              prev.map(s => (s.id === stream.id ? { ...s, disabled: action === 'stop' ? 1 : 0 } : s))
            );
          }
          pollHealth();
        } else {
```

with:

```typescript
        if (res.ok) {
          if (action === 'restart' && data.restarted === false) {
            showError(
              'Restart Incomplete',
              `"${stream.name}" was not restarted — it may be stopped or the supervisor is unreachable.`
            );
          } else if (data.degraded) {
            // Break-glass: the supervisor was unreachable; the durable flag was
            // saved by the web layer and applies on the next reconcile.
            const verb = action === 'start' ? 'start' : 'stop';
            showSuccess(
              'Saved — supervisor offline',
              `Queued ${verb} for "${stream.name}". It applies when the supervisor reconnects.`
            );
          } else {
            const verb = action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Restarted';
            showSuccess(`Stream ${verb}`, `"${stream.name}" has been ${verb.toLowerCase()}.`);
          }
          // Status comes from the authoritative supervisor poll, not an
          // optimistic local flag (the web no longer owns the disabled write).
          pollHealth();
        } else {
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/streams/page.tsx
git commit -m "refactor(streams): rely on supervisor poll for status; surface degraded fallback"
```

---

## Task 11: gitignore + docs

**Files:**
- Modify: `.gitignore`
- Modify: `scripts/streamlink-supervisor/README.md`, `scripts/streamlink-supervisor/AGENTS.md`, `app/streams/AGENTS.md`
- Create: `app/api/supervisor/AGENTS.md`

- [ ] **Step 1: Ignore WAL sidecar files**

Append to `.gitignore`:

```gitignore
# SQLite WAL sidecar files (created once WAL mode is enabled)
*.db-wal
*.db-shm
```

- [ ] **Step 2: Document the supervisor control endpoints**

In `scripts/streamlink-supervisor/README.md` and `scripts/streamlink-supervisor/AGENTS.md`, add a section documenting:
- The supervisor now opens `sources.db` **read-write** (WAL + busy_timeout) via `bunDatabase.ts`, shared by `index.bun.ts` and `src/cli/commands/supervisor.bun.ts`.
- New HTTP routes: `POST /streams/{obs_source_name}/start`, `/stop`, `/restart`; `GET /streams` (DB-backed list with live status).
- Start/Stop flip the durable `disabled` flag then start/stop directly; `/reload` remains the reconcile authority and converges on the `disabled` filter.
- WAL requires a local-filesystem `FILE_DIRECTORY`.

- [ ] **Step 3: Document the web routes**

In `app/streams/AGENTS.md`, note the control routes forward to the supervisor and break-glass to a DB write when it's unreachable. Create `app/api/supervisor/AGENTS.md` describing `health`, and the mutating `streams/[id]/{start,stop,restart}` routes (forward + break-glass; id→obs_source_name resolution; localhost trust boundary, no auth yet).

- [ ] **Step 4: Commit**

```bash
git add .gitignore scripts/streamlink-supervisor/README.md scripts/streamlink-supervisor/AGENTS.md app/streams/AGENTS.md app/api/supervisor/AGENTS.md
git commit -m "docs: supervisor RW + control endpoints; ignore WAL sidecar files"
```

---

## Task 12: Full verification + binary smoke + end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Static gates**

Run: `npm run type-check && npm run lint && npx jest`
Expected: type-check clean; lint only pre-existing warnings; all Jest suites pass (incl. the new loader/healthServer/runtime/supervisorClient/route tests).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: exit 0; the four `app/api/supervisor/...` routes compile.

- [ ] **Step 3: Audit gate stays green**

Run: `npm run audit:sqlite-opens`
Expected: PASS (the only changed `open({...})` site is `lib/database.ts`; the bun `new BunDatabase(...)` opens are not tracked by the audit — confirm no failure).

- [ ] **Step 4: Build both binaries**

Run: `npm run supervisor:build:win` and `npm run binary:build:win`
Expected: both compile to `dist/supervisor.exe` and `dist/cuesheet.exe`.

- [ ] **Step 5: Binary write smoke (the blocking-fix verification)**

With a test DB containing one stream row (`disabled=0`), run the compiled `cuesheet` supervisor and confirm a write succeeds:

```powershell
# Point at the real local DB (or a copy). Start the supervisor binary:
$env:FILE_DIRECTORY = "C:/OBS/source-switching"
dist\cuesheet.exe sup
# In another shell — Stop then verify disabled flipped to 1 in the DB:
curl -X POST "http://127.0.0.1:8080/streams/<obs_source_name>/stop"
# Expect {"status":"ok","streamId":"<obs_source_name>"} AND the row's disabled=1.
# Start to flip it back:
curl -X POST "http://127.0.0.1:8080/streams/<obs_source_name>/start"
```

Expected: both return `{"status":"ok",...}` (NOT `SQLITE_READONLY`); the `disabled` column toggles 1 then 0. This proves the shipped binary opens RW.

- [ ] **Step 6: WAL assertion on the live DB**

Run (PowerShell, against the real DB after the supervisor has opened it):

```powershell
node -e "const s=require('sqlite3');const d=new s.Database('C:/OBS/source-switching/sources.db');d.get('PRAGMA journal_mode',(e,r)=>{console.log(r);d.close()})"
```

Expected: `{ journal_mode: 'wal' }`.

- [ ] **Step 7: End-to-end UI pass (both surfaces)**

With `npm run dev` (web :3000) and the supervisor running:
- **Supervisor dashboard** (`http://127.0.0.1:8080/`): each row shows a glyph + word status; Start disabled when running, Stop/Restart disabled when stopped; Stop/Restart prompt a confirm; clicking updates within ~3s.
- **Web `/streams`** (`http://localhost:3000/streams`): buttons drive the same actions; status badge glyphs render; stop the supervisor and confirm a Stop click shows the "Saved — supervisor offline" toast and the DB `disabled` flips (break-glass), with no crash.

- [ ] **Step 8: Final commit (if any doc/tweak fixes surfaced)**

```bash
git add -A
git commit -m "test: verify supervisor-backed stream control end-to-end"
```

---

## Notes for the implementer

- **TDD order matters:** Tasks 1-6 are Jest-testable and gate each other; Tasks 7-10 are bun/static/client code verified by build + the Task 12 smoke. Don't reorder 8 before 7 (the shim must exist first) or 4 before 3 (runtime imports `DashboardStream` from healthServer).
- **`onStop` reads before writing** to return a clean 404 for unknown ids; the DB write still precedes `supervisor.stop()`, keeping the durable flag authoritative (partial-failure contract).
- **Type consistency check:** `MinimalDb.all` now takes `...params`; `MinimalDb.run` returns `Promise<void>`; `loadStreamSpec(opts, streamId)` (opts first); runtime exposes `onStart`/`onStop`/`listAll`; healthServer context fields are named `onStart`/`onStop`/`listAll`; client returns `{ reachable, ok }`. These names are used identically across Tasks 1, 3, 4, 5, 6.
- **The bun files are invisible to tsc and Jest** — the Task 12 binary smoke is the ONLY gate that exercises `bunDatabase.ts` + both entrypoints. Do not skip it.
```
