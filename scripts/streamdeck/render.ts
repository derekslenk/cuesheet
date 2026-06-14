// Rasterizes a single 96x96 key image to an RGBA buffer for fillKeyBuffer.
// Pure color/text helpers live in colors.ts; this module owns the canvas dependency.
import { createCanvas } from '@napi-rs/canvas'
import { COLORS, cssRgb, splitWordsBalanced, type RGB } from './colors.js'

export const KEY_SIZE = 96

export interface KeySpec {
  /** Small top line (e.g. slot name or a label). */
  title?: string
  /** Main line (e.g. streamer/team name). */
  subtitle?: string
  bg?: RGB
  fg?: RGB
  /** Optional left-edge accent bar. */
  accent?: RGB
  /** Render dimmed (e.g. a disabled nav key). */
  dim?: boolean
}

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>

/** Pick the largest font from `sizes` that fits `maxWidth`; truncate with an ellipsis if none fit. */
function fitText(ctx: Ctx, text: string, maxWidth: number, sizes: number[], weight: string): string {
  for (const px of sizes) {
    ctx.font = `${weight} ${px}px sans-serif`
    if (ctx.measureText(text).width <= maxWidth) return text
  }
  ctx.font = `${weight} ${sizes[sizes.length - 1]}px sans-serif`
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  return t.length < text.length ? t.replace(/\s+$/, '') + '…' : text
}

/** Trim `text` with an ellipsis until it fits `maxWidth` at the current ctx.font. */
function truncateToWidth(ctx: Ctx, text: string, maxWidth: number): string {
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  return t.length < text.length ? t.replace(/\s+$/, '') + '…' : text
}

/**
 * Lay out the subtitle: a single line at a comfortable size when it fits; else a
 * two-line wrap for multi-word names (e.g. "Harbinger Hammers"); else shrink+truncate.
 */
function layoutSubtitle(ctx: Ctx, text: string, maxWidth: number): { lines: string[]; fontPx: number } {
  for (const px of [24, 21, 18]) {
    ctx.font = `bold ${px}px sans-serif`
    if (ctx.measureText(text).width <= maxWidth) return { lines: [text], fontPx: px }
  }
  const parts = splitWordsBalanced(text)
  if (parts.length === 2) {
    for (const px of [22, 19, 16, 14, 13]) {
      ctx.font = `bold ${px}px sans-serif`
      if (parts.every((p) => ctx.measureText(p).width <= maxWidth)) return { lines: parts, fontPx: px }
    }
    ctx.font = 'bold 13px sans-serif'
    return { lines: parts.map((p) => truncateToWidth(ctx, p, maxWidth)), fontPx: 13 }
  }
  ctx.font = 'bold 13px sans-serif'
  return { lines: [truncateToWidth(ctx, text, maxWidth)], fontPx: 13 }
}

/** Render a key to a 96*96*4 RGBA byte buffer. */
export function renderKey(spec: KeySpec): Uint8Array {
  const size = KEY_SIZE
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = cssRgb(spec.bg ?? COLORS.empty)
  ctx.fillRect(0, 0, size, size)

  if (spec.accent) {
    ctx.fillStyle = cssRgb(spec.accent)
    ctx.fillRect(0, 0, 6, size)
  }

  ctx.fillStyle = cssRgb(spec.fg ?? COLORS.white)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = size / 2
  const maxW = size - 12

  if (spec.title) {
    const t = fitText(ctx, spec.title.toUpperCase(), maxW, [15, 13, 11], '600')
    ctx.fillText(t, cx, 18)
  }
  if (spec.subtitle) {
    const { lines, fontPx } = layoutSubtitle(ctx, spec.subtitle, maxW)
    ctx.font = `bold ${fontPx}px sans-serif`
    const lineH = fontPx * 1.18
    const baseY = spec.title ? 58 : size / 2
    let y = baseY - (lineH * (lines.length - 1)) / 2
    for (const ln of lines) {
      ctx.fillText(ln, cx, y)
      y += lineH
    }
  }

  if (spec.dim) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(0, 0, size, size)
  }

  const img = ctx.getImageData(0, 0, size, size)
  // Copy out of the canvas-backed buffer; format is RGBA.
  return new Uint8Array(img.data.buffer.slice(0))
}
