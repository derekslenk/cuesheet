// Shared types for the Stream Deck control sidecar.
// Mirrors the shapes returned by the cuesheet HTTP API (GET /api/teams, /api/streams).

/** The 7 fixed on-screen slots (mirrors SCREEN_POSITIONS in lib/constants.ts). */
export type Slot =
  | 'large'
  | 'left'
  | 'right'
  | 'top_left'
  | 'top_right'
  | 'bottom_left'
  | 'bottom_right'

export const SLOTS: readonly Slot[] = [
  'large',
  'left',
  'right',
  'top_left',
  'top_right',
  'bottom_left',
  'bottom_right',
] as const

/** A team as returned by GET /api/teams. */
export interface Team {
  team_id: number
  team_name: string
  group_name: string | null
  group_uuid?: string | null
}

/** A stream as returned by GET /api/streams (joined with team info). */
export interface Stream {
  id: number
  name: string
  obs_source_name: string
  url: string
  team_id: number
  disabled?: number
  team_name: string | null
  group_name: string | null
}

/** Navigation level of the drill-down. */
export type Level = 'home' | 'teams' | 'streamers'
