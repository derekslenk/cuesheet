// Smoke tests for the canvas rasterizer. Requires @napi-rs/canvas to be installed.
import { renderKey, KEY_SIZE } from '../render.js'
import { COLORS } from '../colors.js'

const pixel = (buf: Uint8Array, x: number, y: number) => {
  const i = (y * KEY_SIZE + x) * 4
  return { r: buf[i], g: buf[i + 1], b: buf[i + 2], a: buf[i + 3] }
}

describe('renderKey', () => {
  it('produces a full 96x96 RGBA buffer', () => {
    const buf = renderKey({ subtitle: 'Test' })
    expect(buf.length).toBe(KEY_SIZE * KEY_SIZE * 4)
  })

  it('fills the background color (sampled at a text-free corner)', () => {
    const buf = renderKey({ bg: COLORS.plate })
    const p = pixel(buf, 92, 4)
    expect(p).toEqual({ r: COLORS.plate.r, g: COLORS.plate.g, b: COLORS.plate.b, a: 255 })
  })

  it('draws the accent bar on the left edge', () => {
    const buf = renderKey({ bg: COLORS.empty, accent: COLORS.accent })
    const p = pixel(buf, 2, 48)
    expect(p).toEqual({ r: COLORS.accent.r, g: COLORS.accent.g, b: COLORS.accent.b, a: 255 })
  })

  it('dims the whole key when dim is set', () => {
    const bright = renderKey({ bg: COLORS.plate })
    const dimmed = renderKey({ bg: COLORS.plate, dim: true })
    const b = pixel(bright, 92, 4)
    const d = pixel(dimmed, 92, 4)
    expect(d.r).toBeLessThan(b.r) // darkened
  })

  it('renders a long two-word name (wrapped) without error and draws text', () => {
    const buf = renderKey({ subtitle: 'Harbinger Hammers' })
    expect(buf.length).toBe(KEY_SIZE * KEY_SIZE * 4)
    let textPixels = 0
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i] > 120 && buf[i + 1] > 120 && buf[i + 2] > 120) textPixels++
    }
    expect(textPixels).toBeGreaterThan(0)
  })
})
