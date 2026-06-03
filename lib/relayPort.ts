/**
 * Deterministic stream-id → local UDP relay port mapping.
 *
 * Shared by the webui (which sets the OBS ffmpeg_source `input`) and the
 * streamlink supervisor (which relays streamlink→ffmpeg→UDP to this port).
 * Both derive the SAME port from the stream's SQLite `id` with zero
 * coordination — no shared registry, no negotiation.
 *
 * Keyed on the autoincrement `id` (unique) rather than a hash of the source
 * name, so there are no port collisions for the realistic event range
 * (stream ids stay well under RELAY_PORT_RANGE).
 *
 * Override via env on both the webui and the supervisor (must match):
 *   RELAY_HOST (default 127.0.0.1), RELAY_BASE_PORT (9000), RELAY_PORT_RANGE (2000)
 */

export const RELAY_HOST = process.env.RELAY_HOST || '127.0.0.1';
export const RELAY_BASE_PORT = parseInt(process.env.RELAY_BASE_PORT || '9000', 10);
export const RELAY_PORT_RANGE = parseInt(process.env.RELAY_PORT_RANGE || '2000', 10);

export function relayPort(streamId: number | string): number {
  const id = Number(streamId);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error(`relayPort requires a positive integer stream id, got: ${String(streamId)}`);
  }
  const port = RELAY_BASE_PORT + (id % RELAY_PORT_RANGE);
  if (port < 1 || port > 65535) {
    throw new RangeError(`computed relay port ${port} is out of range [1,65535]`);
  }
  return port;
}

export function relayUdpUrl(streamId: number | string): string {
  return `udp://${RELAY_HOST}:${relayPort(streamId)}`;
}
