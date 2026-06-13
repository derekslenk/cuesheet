import {
  KEY_COUNT,
  NAV,
  ITEM_KEYS,
  CAPACITY,
  HOME_SLOT_KEYS,
  HOME_ACTION_KEYS,
  pageCount,
  clampPage,
  pageItems,
  itemKeyForPosition,
  positionForItemKey,
} from '../layout.js'
import { SLOTS } from '../types.js'

describe('layout key map', () => {
  it('has 32 keys and 29 item keys with 3 nav keys', () => {
    expect(KEY_COUNT).toBe(32)
    expect(CAPACITY).toBe(29)
    expect(ITEM_KEYS).toHaveLength(29)
  })

  it('nav keys are not item keys', () => {
    for (const k of [NAV.BACK, NAV.PREV, NAV.NEXT]) {
      expect(ITEM_KEYS).not.toContain(k)
    }
  })

  it('item keys + nav keys cover all 32 indices with no overlap', () => {
    const all = new Set<number>([...ITEM_KEYS, NAV.BACK, NAV.PREV, NAV.NEXT])
    expect(all.size).toBe(32)
    for (let i = 0; i < 32; i++) expect(all.has(i)).toBe(true)
  })

  it('maps all 7 slots to distinct keys on Home', () => {
    const keys = SLOTS.map((s) => HOME_SLOT_KEYS[s])
    expect(keys).toHaveLength(7)
    expect(new Set(keys).size).toBe(7)
  })

  it('home action keys do not collide with home slot keys', () => {
    const slotKeys = new Set<number>(Object.values(HOME_SLOT_KEYS))
    for (const k of Object.values(HOME_ACTION_KEYS)) {
      expect(slotKeys.has(k)).toBe(false)
    }
  })
})

describe('pagination', () => {
  it('pageCount is at least 1 and rolls over at the capacity boundary', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(1)).toBe(1)
    expect(pageCount(CAPACITY)).toBe(1)
    expect(pageCount(CAPACITY + 1)).toBe(2)
    expect(pageCount(CAPACITY * 2)).toBe(2)
    expect(pageCount(CAPACITY * 2 + 1)).toBe(3)
  })

  it('clampPage keeps the page within [0, pageCount-1]', () => {
    expect(clampPage(-5, 100)).toBe(0)
    expect(clampPage(99, CAPACITY + 1)).toBe(1) // 2 pages -> max index 1
    expect(clampPage(1, CAPACITY + 1)).toBe(1)
    expect(clampPage(0, 0)).toBe(0)
  })

  it('pageItems slices the right window and clamps out-of-range pages', () => {
    const items = Array.from({ length: 60 }, (_, i) => i)
    expect(pageItems(items, 0)).toEqual(items.slice(0, 29))
    expect(pageItems(items, 1)).toEqual(items.slice(29, 58))
    expect(pageItems(items, 2)).toEqual(items.slice(58, 60))
    expect(pageItems(items, 99)).toEqual(items.slice(58, 60))
  })

  it('position <-> item key round-trips, and nav keys are not items', () => {
    for (let pos = 0; pos < CAPACITY; pos++) {
      const key = itemKeyForPosition(pos)
      expect(key).toBeDefined()
      expect(positionForItemKey(key as number)).toBe(pos)
    }
    expect(positionForItemKey(NAV.BACK)).toBe(-1)
    expect(itemKeyForPosition(CAPACITY)).toBeUndefined()
  })
})
