import { buildStreamlinkCmd, buildFfmpegRelayCmd } from '../commands';

describe('buildStreamlinkCmd', () => {
  it('writes raw TS to stdout, picks best quality, restarts live on EOF', () => {
    const { cmd, args } = buildStreamlinkCmd({
      upstreamUrl: 'https://twitch.tv/team_alpha',
      quality: 'best',
    });

    expect(cmd).toBe('streamlink');
    expect(args).toContain('https://twitch.tv/team_alpha');
    expect(args).toContain('best');
    expect(args).toContain('--stdout');
    expect(args).toContain('--hls-live-restart');
    // --twitch-disable-ads is obsolete (removed after streamlink 7.5.0); ad
    // filtering is automatic, so we no longer pass it.
    expect(args).not.toContain('--twitch-disable-ads');
  });

  it('omits the auth header when no OAuth token is given', () => {
    const { args } = buildStreamlinkCmd({ upstreamUrl: 'https://x' });
    expect(args).not.toContain('--twitch-api-header');
  });

  it('adds the Twitch OAuth auth header when a token is given (Turbo → ad-free)', () => {
    const { args } = buildStreamlinkCmd({ upstreamUrl: 'https://x', oauthToken: 'abc123' });
    const i = args.indexOf('--twitch-api-header');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('Authorization=OAuth abc123');
  });

  it('trims the token and treats blank/whitespace as no token', () => {
    expect(buildStreamlinkCmd({ upstreamUrl: 'https://x', oauthToken: '   ' }).args)
      .not.toContain('--twitch-api-header');
    const args = buildStreamlinkCmd({ upstreamUrl: 'https://x', oauthToken: '  tok  ' }).args;
    expect(args[args.indexOf('--twitch-api-header') + 1]).toBe('Authorization=OAuth tok');
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
  it('copies streams (no re-encode) and tees to both the OBS and preview UDP ports', () => {
    const { cmd, args } = buildFfmpegRelayCmd({ port: 9001 });

    expect(cmd).toBe('ffmpeg');
    expect(args).toEqual(expect.arrayContaining([
      '-re',
      '-i', 'pipe:0',
      '-c', 'copy',
      // OBS pinned to first video + optional first audio (not the old `-map 0`).
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-f', 'tee',
    ]));
    expect(args).not.toContain('0'); // the bare `-map 0` (all streams) is gone
    // Single tee target string: OBS leg direct mpegts | preview leg in a fifo.
    const teeTarget = args[args.length - 1];
    expect(teeTarget).toBe(
      '[f=mpegts]udp://127.0.0.1:9001?pkt_size=1316|' +
      '[f=fifo:fifo_format=mpegts:drop_pkts_on_overflow=1:attempt_recovery=1:' +
      'recover_any_error=1:recovery_wait_time=1]udp://127.0.0.1:12001?pkt_size=1316'
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

  it('keeps the OBS leg direct and isolates only the preview leg in a fifo', () => {
    const teeTarget = buildFfmpegRelayCmd({ port: 9001 }).args.at(-1)!;
    const [obsBranch, previewBranch] = teeTarget.split('|');
    // OBS leg: plain mpegts, never wrapped in a fifo (no buffering / drop risk).
    expect(obsBranch).toContain('[f=mpegts]');
    expect(obsBranch).not.toContain('fifo');
    // Preview leg: fifo muxer (own thread, drops on overflow) so it can never
    // backpressure the OBS leg.
    expect(previewBranch).toContain('f=fifo');
    expect(previewBranch).toContain('drop_pkts_on_overflow=1');
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
