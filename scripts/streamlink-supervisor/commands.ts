export interface StreamlinkCmdInput {
  upstreamUrl: string;
  quality?: string;
  streamlinkPath?: string;
  /**
   * Twitch OAuth token (the account's `auth-token`). When set, it is sent as an
   * `Authorization: OAuth <token>` API header. With a Twitch Turbo account this
   * yields genuinely ad-free streams (no ad-break gaps); without Turbo it has
   * no ad effect. Kept out of code/git — supplied via the TWITCH_OAUTH_TOKEN
   * env var by the runtime.
   */
  oauthToken?: string;
}

export interface StreamlinkCmd {
  cmd: string;
  args: string[];
}

export function buildStreamlinkCmd(input: StreamlinkCmdInput): StreamlinkCmd {
  const quality = input.quality ?? 'best';
  const args = ['--stdout', '--hls-live-restart'];
  // Authenticated requests can prevent ads outright (Turbo). streamlink filters
  // ad segments automatically since 7.5.0, so --twitch-disable-ads is obsolete
  // and intentionally omitted.
  const token = input.oauthToken?.trim();
  if (token) {
    args.push('--twitch-api-header', `Authorization=OAuth ${token}`);
  }
  args.push(input.upstreamUrl, quality);
  return {
    cmd: input.streamlinkPath ?? 'streamlink',
    args,
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

  // Dual-output tee.
  //   OBS leg:     direct mpegts — lowest latency, no buffering, byte-identical
  //                to the single-output relay. OBS is never wrapped in a fifo.
  //   Preview leg: wrapped in the `fifo` muxer so it runs in its OWN thread and
  //                drops packets on overflow. This is the critical isolation:
  //                a slow/stalled/absent preview consumer can never backpressure
  //                the shared tee write loop and stall the OBS leg — the exact
  //                failure that forced preview off when both legs shared a thread.
  const previewTarget = `udp://127.0.0.1:${previewPort}?pkt_size=1316`;
  const fifoOpts =
    'fifo_format=mpegts:drop_pkts_on_overflow=1:attempt_recovery=1:recover_any_error=1:recovery_wait_time=1';
  const teeTarget = `[f=mpegts]${obsTarget}|[f=fifo:${fifoOpts}]${previewTarget}`;
  return {
    cmd,
    args: [
      '-re',
      '-i', 'pipe:0',
      '-c', 'copy',
      // Pin OBS to exactly the first video + (optional) first audio. The old
      // `-map 0` forwarded every stream — extra audio tracks, timed-metadata /
      // data streams — which OBS can choke on. `?` keeps audio optional.
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-f', 'tee',
      teeTarget,
    ],
    obsInputUrl,
    previewPort,
  };
}
