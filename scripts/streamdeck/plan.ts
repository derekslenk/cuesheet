// Pure "what does each key show" planner: given the navigation state + roster data,
// produce a Map<keyIndex, KeySpec>. No device, no canvas — fully unit-testable.
import {
  HOME_SLOT_KEYS,
  HOME_ACTION_KEYS,
  NAV,
  ITEM_KEYS,
  pageItems,
  pageCount,
} from './layout.js'
import { COLORS } from './colors.js'
import type { KeySpec } from './render.js'
import type { DeckState } from './stateMachine.js'
import type { ActiveMap } from './cuesheetClient.js'
import type { Slot, Stream, Team } from './types.js'

const SLOT_LABELS: Record<Slot, string> = {
  large: 'LARGE',
  left: 'LEFT',
  right: 'RIGHT',
  top_left: 'TOP L',
  top_right: 'TOP R',
  bottom_left: 'BOT L',
  bottom_right: 'BOT R',
}

export interface PlanData {
  teams: readonly Team[]
  streams: readonly Stream[]
  active: ActiveMap
  reverseIndex: Map<string, number>
}

/** Enabled streams for a team, in roster order. */
export function streamsForTeam(streams: readonly Stream[], teamId: number): Stream[] {
  return streams.filter((s) => s.team_id === teamId && !s.disabled)
}

/** Resolve the streamer name currently shown in a slot (via getActive -> reverse index). */
export function activeStreamName(slot: Slot, data: PlanData): string | null {
  const group = data.active[slot]
  if (!group) return null
  const id = data.reverseIndex.get(group)
  if (id == null) return null
  return data.streams.find((s) => s.id === id)?.name ?? null
}

function actionKey(label: string): KeySpec {
  return { subtitle: label, bg: COLORS.nav, fg: COLORS.navText }
}

/** Build the full key plan for the current state. Keys absent from the map are blanked. */
export function planKeys(state: DeckState, data: PlanData): Map<number, KeySpec> {
  const plan = new Map<number, KeySpec>()

  if (state.level === 'home') {
    for (const slot of Object.keys(HOME_SLOT_KEYS) as Slot[]) {
      const name = activeStreamName(slot, data)
      plan.set(HOME_SLOT_KEYS[slot], {
        title: SLOT_LABELS[slot],
        subtitle: name ?? '—',
        bg: name ? COLORS.plate : COLORS.empty,
        accent: name ? COLORS.accent : undefined,
      })
    }
    plan.set(HOME_ACTION_KEYS.scene1, actionKey('1 SCR'))
    plan.set(HOME_ACTION_KEYS.scene2, actionKey('2 SCR'))
    plan.set(HOME_ACTION_KEYS.scene4, actionKey('4 SCR'))
    plan.set(HOME_ACTION_KEYS.goLive, actionKey('GO LIVE'))
    plan.set(HOME_ACTION_KEYS.refresh, actionKey('REFRESH'))
    return plan
  }

  const labels: string[] =
    state.level === 'teams'
      ? data.teams.map((t) => t.team_name)
      : streamsForTeam(data.streams, state.teamId ?? -1).map((s) => s.name)

  const visible = pageItems(labels, state.page)
  visible.forEach((label, pos) => {
    plan.set(ITEM_KEYS[pos], { subtitle: label, bg: COLORS.plate, accent: COLORS.accent })
  })

  const pages = pageCount(labels.length)
  plan.set(NAV.BACK, actionKey('BACK'))
  plan.set(NAV.PREV, { ...actionKey('‹'), dim: state.page <= 0 })
  plan.set(NAV.NEXT, { ...actionKey('›'), dim: state.page >= pages - 1 })
  return plan
}
