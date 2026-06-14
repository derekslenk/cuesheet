import { planKeys, streamsForTeam, activeStreamName, type PlanData } from '../plan.js'
import { HOME_SLOT_KEYS, HOME_ACTION_KEYS, NAV, ITEM_KEYS, CAPACITY } from '../layout.js'
import { COLORS } from '../colors.js'
import { buildReverseIndex } from '../reverseLookup.js'
import type { DeckState } from '../stateMachine.js'
import type { Stream, Team } from '../types.js'

const mkStream = (over: Partial<Stream> & { id: number; name: string; team_id: number }): Stream => ({
  obs_source_name: '',
  url: '',
  team_name: null,
  group_name: null,
  ...over,
})

const teams: Team[] = [
  { team_id: 1, team_name: 'Jellyfish', group_name: 'Jellyfish' },
  { team_id: 2, team_name: 'Mango', group_name: null },
]
const streams: Stream[] = [
  mkStream({ id: 10, name: 'Palpatine', team_id: 1, team_name: 'Jellyfish', group_name: 'Jellyfish' }),
  mkStream({ id: 11, name: 'Vader', team_id: 1, team_name: 'Jellyfish', group_name: 'Jellyfish' }),
  mkStream({ id: 12, name: 'Shroud', team_id: 2, team_name: 'Mango', group_name: null }),
  mkStream({ id: 13, name: 'Gone', team_id: 2, team_name: 'Mango', group_name: null, disabled: 1 }),
]
const data: PlanData = {
  teams,
  streams,
  active: { large: 'jellyfish_palpatine_stream' },
  reverseIndex: buildReverseIndex(streams),
}

describe('helpers', () => {
  it('streamsForTeam excludes disabled and other teams', () => {
    expect(streamsForTeam(streams, 1).map((s) => s.name)).toEqual(['Palpatine', 'Vader'])
    expect(streamsForTeam(streams, 2).map((s) => s.name)).toEqual(['Shroud']) // Gone is disabled
  })
  it('activeStreamName resolves via the reverse index', () => {
    expect(activeStreamName('large', data)).toBe('Palpatine')
    expect(activeStreamName('left', data)).toBeNull()
  })
})

describe('home plan', () => {
  const plan = planKeys({ level: 'home', slot: null, teamId: null, page: 0 }, data)
  it('shows the occupied slot with the streamer name and plate color', () => {
    const k = plan.get(HOME_SLOT_KEYS.large)!
    expect(k.subtitle).toBe('Palpatine')
    expect(k.bg).toEqual(COLORS.plate)
    expect(k.accent).toEqual(COLORS.accent)
  })
  it('shows empty slots with a dash and the empty color', () => {
    const k = plan.get(HOME_SLOT_KEYS.left)!
    expect(k.subtitle).toBe('—')
    expect(k.bg).toEqual(COLORS.empty)
    expect(k.accent).toBeUndefined()
  })
  it('renders the global action keys', () => {
    expect(plan.get(HOME_ACTION_KEYS.scene1)?.subtitle).toBe('1 SCR')
    expect(plan.get(HOME_ACTION_KEYS.goLive)?.subtitle).toBe('GO LIVE')
    expect(plan.get(HOME_ACTION_KEYS.refresh)?.subtitle).toBe('REFRESH')
  })
})

describe('teams plan', () => {
  const state: DeckState = { level: 'teams', slot: 'large', teamId: null, page: 0 }
  const plan = planKeys(state, data)
  it('lists teams on the item keys', () => {
    expect(plan.get(ITEM_KEYS[0])?.subtitle).toBe('Jellyfish')
    expect(plan.get(ITEM_KEYS[1])?.subtitle).toBe('Mango')
  })
  it('renders nav keys with PREV/NEXT dimmed on a single page', () => {
    expect(plan.get(NAV.BACK)?.subtitle).toBe('BACK')
    expect(plan.get(NAV.PREV)?.dim).toBe(true)
    expect(plan.get(NAV.NEXT)?.dim).toBe(true)
  })
})

describe('streamers plan', () => {
  it('lists only the selected team\'s enabled streamers', () => {
    const plan = planKeys({ level: 'streamers', slot: 'large', teamId: 1, page: 0 }, data)
    expect(plan.get(ITEM_KEYS[0])?.subtitle).toBe('Palpatine')
    expect(plan.get(ITEM_KEYS[1])?.subtitle).toBe('Vader')
    expect(plan.get(ITEM_KEYS[2])).toBeUndefined()
  })
})

describe('pagination in the plan', () => {
  const manyTeams: Team[] = Array.from({ length: 35 }, (_, i) => ({
    team_id: i + 1,
    team_name: `Team ${i + 1}`,
    group_name: null,
  }))
  const bigData: PlanData = { ...data, teams: manyTeams }

  it('page 0 fills all item keys and only NEXT is active', () => {
    const plan = planKeys({ level: 'teams', slot: 'large', teamId: null, page: 0 }, bigData)
    expect(plan.get(ITEM_KEYS[0])?.subtitle).toBe('Team 1')
    expect(plan.get(ITEM_KEYS[CAPACITY - 1])?.subtitle).toBe('Team 29')
    expect(plan.get(NAV.PREV)?.dim).toBe(true)
    expect(plan.get(NAV.NEXT)?.dim).toBe(false)
  })

  it('page 1 shows the remainder and only PREV is active', () => {
    const plan = planKeys({ level: 'teams', slot: 'large', teamId: null, page: 1 }, bigData)
    expect(plan.get(ITEM_KEYS[0])?.subtitle).toBe('Team 30')
    expect(plan.get(ITEM_KEYS[5])?.subtitle).toBe('Team 35')
    expect(plan.get(ITEM_KEYS[6])).toBeUndefined()
    expect(plan.get(NAV.PREV)?.dim).toBe(false)
    expect(plan.get(NAV.NEXT)?.dim).toBe(true)
  })
})
