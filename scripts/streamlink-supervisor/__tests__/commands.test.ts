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
  it('copies streams (no re-encode) and tees MPEG-TS to both the OBS and preview UDP ports', () => {
    const { cmd, args } = buildFfmpegRelayCmd({ port: 9001 });

    expect(cmd).toBe('ffmpeg');
    expect(args).toEqual(expect.arrayContaining([
      '-re',
      '-i', 'pipe:0',
      '-c', 'copy',
      '-map', '0',
      '-f', 'tee',
    ]));
    // Single tee target string carrying both branches.
    const teeTarget = args[args.length - 1];
    expect(teeTarget).toBe(
      '[f=mpegts]udp://127.0.0.1:9001?pkt_size=1316|' +
      '[f=mpegts:onfail=ignore]udp://127.0.0.1:12001?pkt_size=1316'
    );
  });

  it('emits a single-output OBS-only relay (no tee) when previewTee is false', () => {
    const { cmd, args, obsInputUrl, previewPort } = buildFfmpegRelayCmd({ port: 9001, previewTee: false });

    expect(cmd).toBe('ffmpeg');
    expect(args).toEqual(['-re', '-i', 'pipe:0', '-c', 'copy', '-f', 'mpegts', 'udp://127.0.0.1:9001?pkt_size=1316']);
    expect(args).not.toContain('tee');       // nothing shares ffmpeg's write loop
    expect(args.join(' ')).not.toContain('12001'); // preview port never targeted
    // obsInputUrl / previewPort stay identical to tee mode so callers don't care.
    expect(obsInputUrl).toBe('udp://127.0.0.1:9001');
    expect(previewPort).toBe(12001);
  });

  it('keeps the OBS branch unguarded and the preview branch onfail=ignore', () => {
    const teeTarget = buildFfmpegRelayCmd({ port: 9001 }).args.at(-1)!;
    const [obsBranch, previewBranch] = teeTarget.split('|');
    expect(obsBranch).not.toContain('onfail');          // OBS path must never be skipped
    expect(previewBranch).toContain('onfail=ignore');   // preview must never block OBS
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
    const { obsInputUrl, previewPort } = buildFfmpegRelayCmd({ port: 9042 });
    expect(obsInputUrl).toBe('udp://127.0.0.1:9042');
    expect(previewPort).toBe(12042);
  });
});
