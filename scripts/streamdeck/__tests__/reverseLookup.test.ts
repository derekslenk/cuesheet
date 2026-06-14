import { buildReverseIndex, streamIdForActive } from '../reverseLookup.js'
import type { Stream } from '../types.js'

const mk = (over: Partial<Stream> & { id: number; name: string }): Stream => ({
  obs_source_name: '',
  url: '',
  team_id: 0,
  team_name: null,
  group_name: null,
  ...over,
})

describe('reverse lookup', () => {
  it('maps the canonical group-name string to the stream id', () => {
    const streams: Stream[] = [
      mk({ id: 1, name: 'Palpatine', team_name: 'Jellyfish', group_name: 'Jellyfish' }),
      mk({ id: 2, name: 'Shroud', team_name: 'Mango', group_name: null }),
    ]
    const idx = buildReverseIndex(streams)
    expect(streamIdForActive('jellyfish_palpatine_stream', idx)).toBe(1)
    expect(streamIdForActive('mango_shroud_stream', idx)).toBe(2)
  })

  it('prefers group_name over team_name when they differ (the page.tsx bug case)', () => {
    const streams: Stream[] = [
      mk({ id: 9, name: 'Ace', team_name: 'Red Team', group_name: 'crimson' }),
    ]
    const idx = buildReverseIndex(streams)
    // canonical name uses group_name -> "crimson_ace_stream", NOT "red_team_ace_stream"
    expect(streamIdForActive('crimson_ace_stream', idx)).toBe(9)
    expect(streamIdForActive('red_team_ace_stream', idx)).toBeNull()
  })

  it('lowercases and underscores multi-word names', () => {
    const streams: Stream[] = [
      mk({ id: 5, name: 'Big Bird', team_name: 'Sesame Street', group_name: null }),
    ]
    const idx = buildReverseIndex(streams)
    expect(streamIdForActive('sesame_street_big_bird_stream', idx)).toBe(5)
  })

  it('returns null for null/undefined/unknown active values', () => {
    const idx = buildReverseIndex([])
    expect(streamIdForActive(null, idx)).toBeNull()
    expect(streamIdForActive(undefined, idx)).toBeNull()
    expect(streamIdForActive('nope_stream', idx)).toBeNull()
  })
})
