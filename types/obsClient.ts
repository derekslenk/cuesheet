import type { OBSWebSocket } from 'obs-websocket-js';

/**
 * The real obs-websocket-js v5 client type.
 *
 * Annotate the result of `getOBSClient()` with this in route handlers so
 * request names, params, and responses are checked by the v5 generics
 * (`OBSRequestTypes` / `OBSResponseTypes`) — instead of a hand-rolled
 * `{ call: (method: string, ...) => Promise<Record<string, unknown>> }` shim
 * that let typo'd request names compile.
 *
 * `lib/obsClient` is plain JS, so `getOBSClient()` itself returns `any`; this
 * annotation is what re-introduces the typing at the call sites until the
 * obsClient module is migrated to TypeScript. See docs/full-review-2026-06
 * (F-H3).
 */
export type ObsClient = OBSWebSocket;
