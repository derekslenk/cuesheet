import {
  initialState,
  selectSlot,
  selectTeam,
  selectStreamer,
  back,
  nextPage,
  prevPage,
  setPage,
  type DeckState,
} from '../stateMachine.js'

describe('navigation transitions', () => {
  it('selectSlot moves home -> teams and records the slot', () => {
    const { state } = selectSlot(initialState, 'large')
    expect(state).toEqual({ level: 'teams', slot: 'large', teamId: null, page: 0 })
  })

  it('selectTeam moves teams -> streamers and records the team', () => {
    const afterSlot = selectSlot(initialState, 'left').state
    const { state } = selectTeam(afterSlot, 42)
    expect(state).toEqual({ level: 'streamers', slot: 'left', teamId: 42, page: 0 })
  })

  it('selectStreamer emits setActive for the chosen slot and resets to home', () => {
    const afterSlot = selectSlot(initialState, 'top_left').state
    const afterTeam = selectTeam(afterSlot, 7).state
    const { state, command } = selectStreamer(afterTeam, 123)
    expect(command).toEqual({ type: 'setActive', slot: 'top_left', streamerId: 123 })
    expect(state).toEqual(initialState)
  })

  it('selectTeam is a no-op off the Teams level', () => {
    const { state, command } = selectTeam(initialState, 7)
    expect(state).toEqual(initialState)
    expect(command).toBeUndefined()
  })

  it('selectStreamer is a no-op off the Streamers level', () => {
    const { command } = selectStreamer(initialState, 1)
    expect(command).toBeUndefined()
  })

  it('back walks streamers -> teams -> home and stays at home', () => {
    const streamers = selectTeam(selectSlot(initialState, 'right').state, 3).state
    const toTeams = back(streamers).state
    expect(toTeams).toEqual({ level: 'teams', slot: 'right', teamId: null, page: 0 })
    const toHome = back(toTeams).state
    expect(toHome).toEqual(initialState)
    expect(back(toHome).state).toEqual(initialState)
  })
})

describe('pagination transitions', () => {
  const base: DeckState = { level: 'teams', slot: 'large', teamId: null, page: 0 }

  it('nextPage/prevPage clamp to the valid range', () => {
    const itemCount = 60 // 3 pages (indices 0..2)
    const p1 = nextPage(base, itemCount).state
    expect(p1.page).toBe(1)
    const p2 = nextPage(p1, itemCount).state
    expect(p2.page).toBe(2)
    const p3 = nextPage(p2, itemCount).state
    expect(p3.page).toBe(2) // clamp at last page
    expect(prevPage(p3, itemCount).state.page).toBe(1)
    expect(prevPage(base, itemCount).state.page).toBe(0) // clamp at 0
  })

  it('setPage clamps directly', () => {
    expect(setPage(base, 99, 30).state.page).toBe(1)
    expect(setPage(base, -1, 30).state.page).toBe(0)
  })

  it('paging preserves level/slot/team', () => {
    const s: DeckState = { level: 'streamers', slot: 'left', teamId: 9, page: 0 }
    const next = nextPage(s, 60).state
    expect(next).toEqual({ level: 'streamers', slot: 'left', teamId: 9, page: 1 })
  })
})
