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
 * ffmpeg fans the copied (no re-encode) MPEG-TS out to TWO UDP targets via the
 * `tee` muxer:
 *   1. the OBS-facing port — byte-for-byte what OBS has always consumed; and
 *   2. a deterministic preview port (relayPort + offset) the webui transmuxes
 *      to HLS for in-browser preview.
 *
 * The preview branch carries `onfail=ignore`, the critical safety property: a
 * stalled or absent preview consumer can never backpressure or degrade the OBS
 * branch. OBS's input URL is unchanged from the single-output relay.
 */
export function buildFfmpegRelayCmd(input: FfmpegRelayInput): FfmpegRelayCmd {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new RangeError(`port must be an integer in [1, 65535], got ${input.port}`);
  }
  const previewPort = previewPortFor(input.port);
  const obsTarget = `udp://127.0.0.1:${input.port}?pkt_size=1316`;
  const previewTarget = `udp://127.0.0.1:${previewPort}?pkt_size=1316`;
  // tee outputs: OBS branch (unguarded) | preview branch (onfail=ignore).
  const teeTarget = `[f=mpegts]${obsTarget}|[f=mpegts:onfail=ignore]${previewTarget}`;
  return {
    cmd: input.ffmpegPath ?? 'ffmpeg',
    args: [
      '-re',
      '-i', 'pipe:0',
      '-c', 'copy',
      '-map', '0',
      '-f', 'tee',
      teeTarget,
    ],
    obsInputUrl: `udp://127.0.0.1:${input.port}`,
    previewPort,
  };
}
