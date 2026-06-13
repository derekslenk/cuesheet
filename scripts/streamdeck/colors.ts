// Pure color + text helpers for key rendering. No canvas dependency, so these
// are always unit-testable. OBS stores colors as ABGR ints; the deck renders RGBA.

export interface RGB {
  r: number
  g: number
  b: number
}

/** Convert an OBS ABGR color int (e.g. 0xFF5A2F47) to RGB. */
export function obsAbgrToRgb(n: number): RGB {
  return { r: n & 0xff, g: (n >>> 8) & 0xff, b: (n >>> 16) & 0xff }
}

export const cssRgb = ({ r, g, b }: RGB): string => `rgb(${r}, ${g}, ${b})`

/** cuesheet broadcast palette (mirrors lib/labelLayout.js) plus deck UI colors. */
export const COLORS = {
  plate: obsAbgrToRgb(0xff5a2f47), // #472F5A — Tiltify event purple
  accent: obsAbgrToRgb(0xfff1d9e0), // #E0D9F1 — lavender accent
  white: { r: 245, g: 245, b: 248 },
  empty: { r: 28, g: 28, b: 32 }, // unoccupied slot
  nav: { r: 44, g: 44, b: 52 }, // navigation key background
  navText: { r: 205, g: 205, b: 214 },
  ok: { r: 40, g: 200, b: 80 }, // success flash
  error: { r: 200, g: 48, b: 48 }, // failure flash
} as const

/** Truncate to maxChars, appending an ellipsis when shortened. */
export function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0) return ''
  if (text.length <= maxChars) return text
  if (maxChars === 1) return text.slice(0, 1)
  return text.slice(0, maxChars - 1).trimEnd() + '…'
}

/**
 * Split a multi-word string into two length-balanced lines on a word boundary,
 * e.g. "Harbinger Hammers" -> ["Harbinger", "Hammers"]. A single word (or empty
 * string) returns one entry. Used to wrap long names onto a second key line.
 */
export function splitWordsBalanced(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return [words[0] ?? '']
  let bestSplit = 1
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ')
    const right = words.slice(i).join(' ')
    const diff = Math.abs(left.length - right.length)
    if (diff < bestDiff) {
      bestDiff = diff
      bestSplit = i
    }
  }
  return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')]
}
