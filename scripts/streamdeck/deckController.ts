// Orchestrates the deck: holds navigation state + roster data, paints the device
// from the pure plan, routes key presses through the state machine, performs
// setActive with optimistic update + poll reconciliation. Talks only to the
// DeckDevice interface and the CuesheetClient, so tests drive it with fakes.
import type { DeckDevice } from './deckDevice.js'
import type { CuesheetClient, ActiveMap } from './cuesheetClient.js'
import type { DeckConfig } from './config.js'
import type { Slot, Stream, Team } from './types.js'
import {
  initialState,
  selectSlot,
  selectTeam,
  selectStreamer,
  back,
  nextPage,
  prevPage,
  type DeckState,
} from './stateMachine.js'
import { HOME_SLOT_KEYS, HOME_ACTION_KEYS, NAV, positionForItemKey, pageItems } from './layout.js'
import { planKeys, streamsForTeam, type PlanData } from './plan.js'
import { renderKey } from './render.js'
import { buildReverseIndex } from './reverseLookup.js'
import { COLORS } from './colors.js'
import { buildStreamGroupName } from '../../lib/streamGroupName.js'

const SLOT_BY_HOME_KEY = new Map<number, Slot>(
  (Object.keys(HOME_SLOT_KEYS) as Slot[]).map((s) => [HOME_SLOT_KEYS[s], s]),
)

export interface ControllerDeps {
  device: DeckDevice
  client: CuesheetClient
  config: DeckConfig
  now?: () => number
  log?: (msg: string) => void
}

export class DeckController {
  private readonly device: DeckDevice
  private readonly client: CuesheetClient
  private readonly config: DeckConfig
  private readonly now: () => number
  private readonly log: (msg: string) => void

  private state: DeckState = initialState
  private teams: Team[] = []
  private streams: Stream[] = []
  private active: ActiveMap = {}
  private reverseIndex = new Map<string, number>()
  private readonly pending = new Map<Slot, { expectedId: number; deadline: number }>()
  private readonly painted = new Map<number, string>()
  private pollTimer?: ReturnType<typeof setInterval>
  private rosterTimer?: ReturnType<typeof setInterval>

  constructor(deps: ControllerDeps) {
    this.device = deps.device
    this.client = deps.client
    this.config = deps.config
    this.now = deps.now ?? (() => Date.now())
    this.log = deps.log ?? (() => {})
  }

  /** Read accessors (used by tests). */
  getState(): DeckState {
    return this.state
  }
  getActive(): ActiveMap {
    return this.active
  }

  /** Load roster + active, wire the key handler, paint once. No timers. */
  async init(): Promise<void> {
    await this.device.setBrightness(this.config.brightness)
    await this.refreshRoster()
    await this.refreshActive()
    this.device.onDown((index) => void this.onKeyDown(index))
    this.device.onError((err) =>
      this.log(`[deck] device error: ${err instanceof Error ? err.message : String(err)}`),
    )
    await this.repaint()
  }

  /** init() plus background polling. */
  async start(): Promise<void> {
    await this.init()
    this.pollTimer = setInterval(() => void this.tickActive(), this.config.pollMs)
    this.rosterTimer = setInterval(() => void this.refreshRoster(), this.config.rosterRefreshMs)
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.rosterTimer) clearInterval(this.rosterTimer)
    this.pollTimer = undefined
    this.rosterTimer = undefined
  }

  async refreshRoster(): Promise<void> {
    const [teams, streams] = await Promise.all([this.client.getTeams(), this.client.getStreams()])
    if (teams.length) this.teams = teams
    if (streams.length) {
      this.streams = streams
      this.reverseIndex = buildReverseIndex(streams)
    }
  }

  async refreshActive(): Promise<void> {
    const server = await this.client.getActive()
    if (server) this.active = this.reconcile(server)
  }

  private async tickActive(): Promise<void> {
    await this.refreshActive()
    if (this.state.level === 'home') await this.paint()
  }

  /** Merge server active with still-pending optimistic intents. */
  private reconcile(server: ActiveMap): ActiveMap {
    const merged: ActiveMap = { ...server }
    const t = this.now()
    for (const [slot, p] of this.pending) {
      const serverId = this.reverseIndex.get(server[slot as Slot] ?? '') ?? null
      if (serverId === p.expectedId || t >= p.deadline) {
        this.pending.delete(slot) // confirmed, or gave up and accept server truth
      } else {
        const stream = this.streams.find((s) => s.id === p.expectedId)
        if (stream) merged[slot as Slot] = buildStreamGroupName(stream)
      }
    }
    return merged
  }

  private planData(): PlanData {
    return { teams: this.teams, streams: this.streams, active: this.active, reverseIndex: this.reverseIndex }
  }

  private itemCount(): number {
    return this.state.level === 'teams'
      ? this.teams.length
      : streamsForTeam(this.streams, this.state.teamId ?? -1).length
  }

  /** Paint only the keys whose content changed since the last paint. */
  async paint(): Promise<void> {
    const plan = planKeys(this.state, this.planData())
    for (let i = 0; i < this.device.keyCount; i++) {
      const spec = plan.get(i)
      const sig = spec ? JSON.stringify(spec) : 'blank'
      if (this.painted.get(i) === sig) continue
      this.painted.set(i, sig)
      if (spec) await this.device.fillKeyBuffer(i, renderKey(spec), { format: 'rgba' })
      else await this.device.clearKey(i)
    }
  }

  /** Force a full repaint (used on level changes). */
  private async repaint(): Promise<void> {
    this.painted.clear()
    await this.paint()
  }

  async onKeyDown(index: number): Promise<void> {
    try {
      if (this.state.level === 'home') await this.onHomeKey(index)
      else await this.onListKey(index)
    } catch (err) {
      this.log(`[deck] key handler error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async onHomeKey(index: number): Promise<void> {
    const slot = SLOT_BY_HOME_KEY.get(index)
    if (slot) {
      this.state = selectSlot(this.state, slot).state
      await this.repaint()
      return
    }
    switch (index) {
      case HOME_ACTION_KEYS.scene1:
        await this.client.setScene('1-Screen')
        return
      case HOME_ACTION_KEYS.scene2:
        await this.client.setScene('2-Screen')
        return
      case HOME_ACTION_KEYS.scene4:
        await this.client.setScene('4-Screen')
        return
      case HOME_ACTION_KEYS.goLive:
        await this.client.triggerTransition()
        return
      case HOME_ACTION_KEYS.refresh:
        await this.refreshRoster()
        await this.refreshActive()
        await this.repaint()
        return
      default:
        return
    }
  }

  private async onListKey(index: number): Promise<void> {
    if (index === NAV.BACK) {
      this.state = back(this.state).state
      await this.repaint()
      return
    }
    if (index === NAV.PREV) {
      this.state = prevPage(this.state, this.itemCount()).state
      await this.repaint()
      return
    }
    if (index === NAV.NEXT) {
      this.state = nextPage(this.state, this.itemCount()).state
      await this.repaint()
      return
    }
    const pos = positionForItemKey(index)
    if (pos < 0) return

    if (this.state.level === 'teams') {
      const team = pageItems(this.teams, this.state.page)[pos]
      if (team) {
        this.state = selectTeam(this.state, team.team_id).state
        await this.repaint()
      }
      return
    }

    // streamers level
    const list = streamsForTeam(this.streams, this.state.teamId ?? -1)
    const stream = pageItems(list, this.state.page)[pos]
    if (stream) await this.assignStreamer(stream)
  }

  private async assignStreamer(stream: Stream): Promise<void> {
    const slot = this.state.slot
    const { state, command } = selectStreamer(this.state, stream.id)
    this.state = state // back to home
    if (!command || !slot) {
      await this.repaint()
      return
    }
    // Optimistic: show the streamer in the slot immediately.
    this.active = { ...this.active, [slot]: buildStreamGroupName(stream) }
    this.pending.set(slot, { expectedId: stream.id, deadline: this.now() + 2 * this.config.pollMs })
    await this.repaint()

    const res = await this.client.setActive(slot, stream.id)
    if (!res.ok) {
      this.log(`[deck] setActive failed (status ${res.status}): ${slot} <- ${stream.name}`)
      this.pending.delete(slot)
      // Revert to server truth so the failure is never silent.
      const server = await this.client.getActive()
      if (server) this.active = server
      // Transient error marker; the next poll/paint restores the real state.
      await this.device.fillKeyBuffer(
        HOME_SLOT_KEYS[slot],
        renderKey({ title: 'FAILED', subtitle: '✕', bg: COLORS.error }),
        { format: 'rgba' },
      )
      this.painted.delete(HOME_SLOT_KEYS[slot])
    }
  }
}
