import { buildStreamlinkCmd, buildFfmpegRelayCmd } from '../commands';

describe('buildStreamlinkCmd', () => {
  it('writes raw TS to stdout, picks best quality, disables Twitch ads, restarts live on EOF', () => {
    const { cmd, args } = buildStreamlinkCmd({
      upstreamUrl: 'https://twitch.tv/team_alpha',
      quality: 'best',
    });

    expect(cmd).toBe('streamlink');
    expect(args).toContain('https://twitch.tv/team_alpha');
    expect(args).toContain('best');
    expect(args).toContain('--stdout');
    expect(args).toContain('--twitch-disable-ads');
    expect(args).toContain('--hls-live-restart');
  });

  it('honors a custom streamlink binary path (Windows install)', () => {
    const { cmd } = buildStreamlinkCmd({
      upstreamUrl: 'https://x',
      quality: 'best',
      streamlinkPath: 'C:\\Program Files\\Streamlink\\bin\\streamlink.exe',
    });
    expect(cmd).toBe('C:\\Program Files\\Streamlink\\bin\\streamlink.exe');
  });

  it('defaults quality to "best" when omitted', () => {
    const { args } = buildStreamlinkCmd({ upstreamUrl: 'https://x' });
    expect(args).toContain('best');
  });
});

describe('buildFfmpegRelayCmd', () => {
  it('copies streams (no re-encode), pushes MPEG-TS to UDP localhost:port', () => {
    const { cmd, args } = buildFfmpegRelayCmd({ port: 9001 });

    expect(cmd).toBe('ffmpeg');
    expect(args).toEqual(expect.arrayContaining([
      '-re',
      '-i', 'pipe:0',
      '-c', 'copy',
      '-f', 'mpegts',
      'udp://127.0.0.1:9001?pkt_size=1316',
    ]));
  });

  it('honors a custom ffmpeg binary path', () => {
    const { cmd } = buildFfmpegRelayCmd({ port: 9001, ffmpegPath: 'C:\\ffmpeg\\bin\\ffmpeg.exe' });
    expect(cmd).toBe('C:\\ffmpeg\\bin\\ffmpeg.exe');
  });

  it('rejects ports outside the unsigned 16-bit range', () => {
    expect(() => buildFfmpegRelayCmd({ port: 0 })).toThrow();
    expect(() => buildFfmpegRelayCmd({ port: 65536 })).toThrow();
    expect(() => buildFfmpegRelayCmd({ port: -1 })).toThrow();
  });

  it('emits a stable URL string callers can pass straight to OBS ffmpeg_source.input', () => {
    const { obsInputUrl } = buildFfmpegRelayCmd({ port: 9042 });
    expect(obsInputUrl).toBe('udp://127.0.0.1:9042');
  });
});
