export interface StreamlinkCmdInput {
  upstreamUrl: string;
  quality?: string;
  streamlinkPath?: string;
}

export interface StreamlinkCmd {
  cmd: string;
  args: string[];
}

export function buildStreamlinkCmd(input: StreamlinkCmdInput): StreamlinkCmd {
  const quality = input.quality ?? 'best';
  return {
    cmd: input.streamlinkPath ?? 'streamlink',
    args: [
      '--stdout',
      '--twitch-disable-ads',
      '--hls-live-restart',
      input.upstreamUrl,
      quality,
    ],
  };
}

import { previewPortFor } from '../../lib/relayPort';

export interface FfmpegRelayInput {
  port: number;
  ffmpegPath?: string;
  /**
   * When true, fan the relay out to BOTH the OBS port and the preview port via
   * the `tee` muxer (enables in-browser preview). When false, emit the original
   * single-output relay that feeds OBS only.
   *
   * Defaults to true for the pure builder, but the runtime (streamPipeline)
   * derives it from PREVIEW_RELAY and defaults it OFF — the dual-output tee was
   * observed to periodically stall the OBS branch, so preview is opt-in until
   * the tee is properly isolated (use_fifo + explicit OBS stream mapping).
   */
  previewTee?: boolean;
}

export interface FfmpegRelayCmd {
  cmd: string;
  args: string[];
  obsInputUrl: string;
  previewPort: number;
}

/**
 * Builds the streamlink→ffmpeg relay command.
 *
 * Two shapes, selected by `previewTee`:
 *
 *  - OFF (single-output, the original relay): copies (no re-encode) the
 *    MPEG-TS straight to the OBS UDP port. This is the OBS-safe default at
 *    runtime — nothing else shares ffmpeg's write loop.
 *
 *  - ON (tee): fans the copied stream to the OBS port AND a deterministic
 *    preview port (relayPort + offset) the webui transmuxes to HLS. The
 *    preview branch carries `onfail=ignore`. NOTE: without `use_fifo` the tee's
 *    outputs share one thread, so a slow/idle preview output can periodically
 *    hiccup the OBS branch — which is exactly why this mode is opt-in for now.
 *
 * `obsInputUrl` and `previewPort` are identical in both modes so callers (and
 * the webui ffmpeg_source input) need not know which shape is in effect.
 */
export function buildFfmpegRelayCmd(input: FfmpegRelayInput): FfmpegRelayCmd {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new RangeError(`port must be an integer in [1, 65535], got ${input.port}`);
  }
  const previewPort = previewPortFor(input.port);
  const obsTarget = `udp://127.0.0.1:${input.port}?pkt_size=1316`;
  const obsInputUrl = `udp://127.0.0.1:${input.port}`;
  const cmd = input.ffmpegPath ?? 'ffmpeg';

  // OBS-only single-output relay (original, pre-preview behavior).
  if (input.previewTee === false) {
    return {
      cmd,
      args: ['-re', '-i', 'pipe:0', '-c', 'copy', '-f', 'mpegts', obsTarget],
      obsInputUrl,
      previewPort,
    };
  }

  // Dual-output tee: OBS branch (unguarded) | preview branch (onfail=ignore).
  const previewTarget = `udp://127.0.0.1:${previewPort}?pkt_size=1316`;
  const teeTarget = `[f=mpegts]${obsTarget}|[f=mpegts:onfail=ignore]${previewTarget}`;
  return {
    cmd,
    args: [
      '-re',
      '-i', 'pipe:0',
      '-c', 'copy',
      '-map', '0',
      '-f', 'tee',
      teeTarget,
    ],
    obsInputUrl,
    previewPort,
  };
}
