// Pure navigation state machine for the drill-down: home -> teams -> streamers.
// Transitions are pure (no device, no I/O). The controller translates physical
// key presses into these semantic transitions and performs any emitted command.
import type { Slot, Level } from './types.js'
import { clampPage } from './layout.js'

export interface DeckState {
  level: Level
  /** The slot being edited (set once a slot is chosen on Home). */
  slot: Slot | null
  /** The team being browsed (set once a team is chosen). */
  teamId: number | null
  /** Current page within the Teams or Streamers list. */
  page: number
}

export const initialState: DeckState = { level: 'home', slot: null, teamId: null, page: 0 }

/** A side-effect to perform after a transition: assign a streamer to the chosen slot. */
export interface SetActiveCommand {
  type: 'setActive'
  slot: Slot
  streamerId: number
}

export interface Transition {
  state: DeckState
  command?: SetActiveCommand
}

/** Home -> Teams, recording the chosen slot. */
export function selectSlot(_state: DeckState, slot: Slot): Transition {
  return { state: { level: 'teams', slot, teamId: null, page: 0 } }
}

/** Teams -> Streamers, recording the chosen team. No-op off the Teams level. */
export function selectTeam(state: DeckState, teamId: number): Transition {
  if (state.level !== 'teams' || state.slot == null) return { state }
  return { state: { level: 'streamers', slot: state.slot, teamId, page: 0 } }
}

/**
 * Streamers -> Home, emitting a setActive command for the chosen slot.
 * No-op off the Streamers level.
 */
export function selectStreamer(state: DeckState, streamerId: number): Transition {
  if (state.level !== 'streamers' || state.slot == null) return { state }
  return {
    state: initialState,
    command: { type: 'setActive', slot: state.slot, streamerId },
  }
}

/** Back one level: streamers -> teams -> home. Home stays home. */
export function back(state: DeckState): Transition {
  if (state.level === 'streamers') {
    return { state: { level: 'teams', slot: state.slot, teamId: null, page: 0 } }
  }
  if (state.level === 'teams') {
    return { state: initialState }
  }
  return { state }
}

/** Set the page directly, clamped to the valid range for `itemCount`. */
export function setPage(state: DeckState, page: number, itemCount: number): Transition {
  return { state: { ...state, page: clampPage(page, itemCount) } }
}

export function nextPage(state: DeckState, itemCount: number): Transition {
  return setPage(state, state.page + 1, itemCount)
}

export function prevPage(state: DeckState, itemCount: number): Transition {
  return setPage(state, state.page - 1, itemCount)
}
