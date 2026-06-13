import { obsAbgrToRgb, cssRgb, truncate, splitWordsBalanced, COLORS } from '../colors.js'

describe('obsAbgrToRgb', () => {
  it('decodes the cuesheet plate + accent colors (ABGR -> RGB)', () => {
    // 0xFF5A2F47 (ABGR) -> #472F5A
    expect(obsAbgrToRgb(0xff5a2f47)).toEqual({ r: 0x47, g: 0x2f, b: 0x5a })
    // 0xFFF1D9E0 (ABGR) -> #E0D9F1
    expect(obsAbgrToRgb(0xfff1d9e0)).toEqual({ r: 0xe0, g: 0xd9, b: 0xf1 })
  })

  it('handles the high (alpha) bit without sign issues', () => {
    expect(obsAbgrToRgb(0xffffffff)).toEqual({ r: 255, g: 255, b: 255 })
    expect(obsAbgrToRgb(0xff000000)).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('exposes the decoded palette constants', () => {
    expect(COLORS.plate).toEqual({ r: 0x47, g: 0x2f, b: 0x5a })
    expect(COLORS.accent).toEqual({ r: 0xe0, g: 0xd9, b: 0xf1 })
  })
})

describe('cssRgb', () => {
  it('formats an rgb() string', () => {
    expect(cssRgb({ r: 71, g: 47, b: 90 })).toBe('rgb(71, 47, 90)')
  })
})

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('Ace', 10)).toBe('Ace')
    expect(truncate('Ace', 3)).toBe('Ace')
  })

  it('adds an ellipsis when shortened', () => {
    expect(truncate('Palpatine', 5)).toBe('Palp…')
    expect(truncate('Longername', 4)).toBe('Lon…')
  })

  it('trims trailing space before the ellipsis', () => {
    expect(truncate('Big Bird', 5)).toBe('Big…')
  })

  it('handles tiny limits', () => {
    expect(truncate('Hello', 1)).toBe('H')
    expect(truncate('Hello', 0)).toBe('')
  })
})

describe('splitWordsBalanced', () => {
  it('splits a two-word name onto two lines', () => {
    expect(splitWordsBalanced('Harbinger Hammers')).toEqual(['Harbinger', 'Hammers'])
  })

  it('keeps a single word as one line', () => {
    expect(splitWordsBalanced('Jellyfish')).toEqual(['Jellyfish'])
  })

  it('balances three or more words by length', () => {
    expect(splitWordsBalanced('Red Hot Chili')).toEqual(['Red Hot', 'Chili'])
  })

  it('collapses extra whitespace and handles empty input', () => {
    expect(splitWordsBalanced('  Big   Bird  ')).toEqual(['Big', 'Bird'])
    expect(splitWordsBalanced('   ')).toEqual([''])
  })
})
