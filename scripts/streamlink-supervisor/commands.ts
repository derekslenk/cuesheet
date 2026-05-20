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

export interface FfmpegRelayInput {
  port: number;
  ffmpegPath?: string;
}

export interface FfmpegRelayCmd {
  cmd: string;
  args: string[];
  obsInputUrl: string;
}

export function buildFfmpegRelayCmd(input: FfmpegRelayInput): FfmpegRelayCmd {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new RangeError(`port must be an integer in [1, 65535], got ${input.port}`);
  }
  const target = `udp://127.0.0.1:${input.port}?pkt_size=1316`;
  return {
    cmd: input.ffmpegPath ?? 'ffmpeg',
    args: [
      '-re',
      '-i', 'pipe:0',
      '-c', 'copy',
      '-f', 'mpegts',
      target,
    ],
    obsInputUrl: `udp://127.0.0.1:${input.port}`,
  };
}
