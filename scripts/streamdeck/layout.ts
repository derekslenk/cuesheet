// Pure key-index <-> role mapping and pagination math for the Stream Deck XL.
// XL is an 8-column x 4-row grid = 32 keys, indices row-major 0..31:
//   Row0:  0  1  2  3  4  5  6  7
//   Row1:  8  9 10 11 12 13 14 15
//   Row2: 16 17 18 19 20 21 22 23
//   Row3: 24 25 26 27 28 29 30 31
import type { Slot } from './types.js'

export const COLS = 8
export const ROWS = 4
export const KEY_COUNT = COLS * ROWS // 32

/** Navigation keys, fixed across the Teams and Streamers levels. */
export const NAV = { BACK: 24, PREV: 30, NEXT: 31 } as const

/**
 * Keys used to render paginated items (teams/streamers): every key except the
 * three nav keys. 29 total.
 */
export const ITEM_KEYS: readonly number[] = (() => {
  const reserved = new Set<number>([NAV.BACK, NAV.PREV, NAV.NEXT])
  const keys: number[] = []
  for (let i = 0; i < KEY_COUNT; i++) if (!reserved.has(i)) keys.push(i)
  return keys
})()

export const CAPACITY = ITEM_KEYS.length // 29

/**
 * Home (Level 0): slot -> physical key index. Mirrors the webui's stacked groups,
 * one per row — Primary (large), Side (left | right), Corner (2x2):
 *   Row0: large
 *   Row1: left  right
 *   Row2: top_left     top_right
 *   Row3: bottom_left  bottom_right
 */
export const HOME_SLOT_KEYS: Record<Slot, number> = {
  large: 0,
  left: 8,
  right: 9,
  top_left: 16,
  top_right: 17,
  bottom_left: 24,
  bottom_right: 25,
}

/**
 * Home (Level 0): global action keys. Scene-layout keys sit at the right edge of
 * each group's row (like the webui's per-section scene buttons); the OBS
 * transition + a deck refresh go bottom-right.
 */
export const HOME_ACTION_KEYS = {
  scene1: 7, // right of the `large` row
  scene2: 15, // right of the left|right row
  scene4: 23, // right of the corner block
  goLive: 31, // OBS Studio-Mode transition (preview -> program); = webui "Go Live"
  refresh: 30, // re-fetch roster + active and repaint the deck
} as const

/** Number of pages needed to show `itemCount` items (always >= 1). */
export function pageCount(itemCount: number): number {
  return Math.max(1, Math.ceil(itemCount / CAPACITY))
}

/** Clamp a page index into [0, pageCount-1]. */
export function clampPage(page: number, itemCount: number): number {
  return Math.min(Math.max(0, page), pageCount(itemCount) - 1)
}

/** The slice of items visible on `page` (clamped). */
export function pageItems<T>(items: readonly T[], page: number): T[] {
  const p = clampPage(page, items.length)
  const start = p * CAPACITY
  return items.slice(start, start + CAPACITY)
}

/** Physical key index for the item at position `pos` within a page, or undefined. */
export function itemKeyForPosition(pos: number): number | undefined {
  return ITEM_KEYS[pos]
}

/** Item position within a page for a pressed key index, or -1 if it is not an item key. */
export function positionForItemKey(keyIndex: number): number {
  return ITEM_KEYS.indexOf(keyIndex)
}
