/**
 * @jest-environment node
 *
 * Tests for the preview HLS route — id/file validation, the C1 429 capacity
 * path, the 503 warm-up, and the H1 cache-header policy (no-store playlist vs
 * immutable segments). previewManager and fs/promises are mocked so no ffmpeg
 * runs and no disk is read.
 */
import { GET } from '../preview/[...slug]/route';

jest.mock('@/lib/previewManager', () => {
  class PreviewCapacityError extends Error {
    constructor() { super('preview capacity reached'); this.name = 'PreviewCapacityError'; }
  }
  return {
    ensurePreview: jest.fn(),
    touchPreview: jest.fn(),
    previewDir: jest.fn(() => '/tmp/cuesheet-preview/5'),
    PreviewCapacityError,
  };
});

jest.mock('fs/promises', () => ({ readFile: jest.fn() }));

function call(slug: string[]) {
  return GET({} as never, { params: Promise.resolve({ slug }) } as never);
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/preview/[...slug]', () => {
  it('404s a file outside the allowlist', async () => {
    const res = await call(['5', 'evil.txt']);
    expect(res.status).toBe(404);
  });

  it('404s a non-positive / non-integer id', async () => {
    expect((await call(['0', 'index.m3u8'])).status).toBe(404);
    expect((await call(['abc', 'index.m3u8'])).status).toBe(404);
  });

  it('returns 429 when the packager is at capacity (C1)', async () => {
    const { ensurePreview, PreviewCapacityError } = require('@/lib/previewManager');
    ensurePreview.mockImplementationOnce(() => { throw new PreviewCapacityError(); });
    const res = await call(['5', 'index.m3u8']);
    expect(res.status).toBe(429);
  });

  it('serves the playlist with no-store', async () => {
    const { readFile } = require('fs/promises');
    readFile.mockResolvedValue(Buffer.from('#EXTM3U'));
    const res = await call(['5', 'index.m3u8']);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('serves a segment as immutable, cacheable mp2t (H1)', async () => {
    const { readFile } = require('fs/promises');
    readFile.mockResolvedValue(Buffer.from('tsdata'));
    const res = await call(['5', 'seg_00001.ts']);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/mp2t');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
  });

  it('503s when the file never appears (warm-up timeout)', async () => {
    const { readFile } = require('fs/promises');
    readFile.mockRejectedValue(new Error('ENOENT'));
    const res = await call(['5', 'seg_00002.ts']); // 2s segment deadline
    expect(res.status).toBe(503);
  }, 10000);
});
