import { DeckController } from '../deckController.js'
import type { DeckDevice } from '../deckDevice.js'
import type { CuesheetClient, ActiveMap } from '../cuesheetClient.js'
import { loadConfig } from '../config.js'
import { HOME_SLOT_KEYS, HOME_ACTION_KEYS, NAV, ITEM_KEYS } from '../layout.js'
import type { Stream, Team } from '../types.js'

const teams: Team[] = [
  { team_id: 1, team_name: 'Jellyfish', group_name: 'Jellyfish' },
  { team_id: 2, team_name: 'Mango', group_name: null },
]
const mkStream = (over: Partial<Stream> & { id: number; name: string; team_id: number }): Stream => ({
  obs_source_name: '',
  url: '',
  team_name: null,
  group_name: null,
  ...over,
})
const streams: Stream[] = [
  mkStream({ id: 10, name: 'Palpatine', team_id: 1, team_name: 'Jellyfish', group_name: 'Jellyfish' }),
  mkStream({ id: 11, name: 'Vader', team_id: 1, team_name: 'Jellyfish', group_name: 'Jellyfish' }),
  mkStream({ id: 12, name: 'Shroud', team_id: 2, team_name: 'Mango', group_name: 'Mango' }),
]

class FakeDevice implements DeckDevice {
  keyCount = 32
  buffers = new Map<number, Uint8Array>()
  cleared = new Set<number>()
  brightness = 0
  fillKeyBuffer = jest.fn(async (i: number, buf: Uint8Array) => {
    this.buffers.set(i, buf)
    this.cleared.delete(i)
  })
  clearKey = jest.fn(async (i: number) => {
    this.cleared.add(i)
    this.buffers.delete(i)
  })
  clearPanel = jest.fn(async () => {})
  setBrightness = jest.fn(async (p: number) => {
    this.brightness = p
  })
  onDown = jest.fn()
  onError = jest.fn()
  close = jest.fn(async () => {})
}

function fakeClient(over: Partial<CuesheetClient> = {}): CuesheetClient {
  return {
    getTeams: async () => teams,
    getStreams: async () => streams,
    getActive: async () => ({}) as ActiveMap,
    setActive: jest.fn(async () => ({ ok: true, status: 200 })),
    setScene: jest.fn(async () => true),
    triggerTransition: jest.fn(async () => true),
    ...over,
  }
}

const cfg = loadConfig({})

describe('DeckController drill-down', () => {
  it('initializes on Home and paints the slot + action keys', async () => {
    const device = new FakeDevice()
    const controller = new DeckController({ device, client: fakeClient(), config: cfg })
    await controller.init()
    expect(controller.getState().level).toBe('home')
    expect(device.setBrightness).toHaveBeenCalledWith(cfg.brightness)
    expect(device.buffers.has(HOME_SLOT_KEYS.large)).toBe(true)
    expect(device.buffers.has(HOME_ACTION_KEYS.goLive)).toBe(true)
  })

  it('walks slot -> team -> streamer and calls setActive with {slot,id}', async () => {
    const device = new FakeDevice()
    const client = fakeClient()
    const controller = new DeckController({ device, client, config: cfg })
    await controller.init()

    await controller.onKeyDown(HOME_SLOT_KEYS.large)
    expect(controller.getState()).toMatchObject({ level: 'teams', slot: 'large' })

    await controller.onKeyDown(ITEM_KEYS[0]) // Jellyfish (team 1)
    expect(controller.getState()).toMatchObject({ level: 'streamers', teamId: 1 })

    await controller.onKeyDown(ITEM_KEYS[1]) // Vader (id 11)
    expect(client.setActive).toHaveBeenCalledWith('large', 11)
    expect(controller.getState().level).toBe('home')
    expect(controller.getActive().large).toBe('jellyfish_vader_stream') // optimistic
  })

  it('reverts the optimistic paint when setActive fails (no silent success)', async () => {
    const device = new FakeDevice()
    const client = fakeClient({
      setActive: jest.fn(async () => ({ ok: false, status: 400 })),
      getActive: async () => ({}) as ActiveMap, // server says the slot is empty
    })
    const controller = new DeckController({ device, client, config: cfg })
    await controller.init()

    await controller.onKeyDown(HOME_SLOT_KEYS.top_left)
    await controller.onKeyDown(ITEM_KEYS[0]) // team 1
    await controller.onKeyDown(ITEM_KEYS[0]) // Palpatine (id 10)

    expect(client.setActive).toHaveBeenCalledWith('top_left', 10)
    expect(controller.getActive().top_left).toBeUndefined() // reverted to server truth
  })

  it('Back walks streamers -> teams -> home', async () => {
    const device = new FakeDevice()
    const controller = new DeckController({ device, client: fakeClient(), config: cfg })
    await controller.init()
    await controller.onKeyDown(HOME_SLOT_KEYS.right)
    await controller.onKeyDown(ITEM_KEYS[0])
    expect(controller.getState().level).toBe('streamers')
    await controller.onKeyDown(NAV.BACK)
    expect(controller.getState().level).toBe('teams')
    await controller.onKeyDown(NAV.BACK)
    expect(controller.getState().level).toBe('home')
  })

  it('drives OBS scene + transition from Home action keys', async () => {
    const device = new FakeDevice()
    const client = fakeClient()
    const controller = new DeckController({ device, client, config: cfg })
    await controller.init()
    await controller.onKeyDown(HOME_ACTION_KEYS.scene2)
    expect(client.setScene).toHaveBeenCalledWith('2-Screen')
    await controller.onKeyDown(HOME_ACTION_KEYS.goLive)
    expect(client.triggerTransition).toHaveBeenCalled()
  })

  it('paginates teams with NEXT/PREV', async () => {
    const manyTeams: Team[] = Array.from({ length: 35 }, (_, i) => ({
      team_id: i + 1,
      team_name: `Team ${i + 1}`,
      group_name: null,
    }))
    const device = new FakeDevice()
    const controller = new DeckController({
      device,
      client: fakeClient({ getTeams: async () => manyTeams }),
      config: cfg,
    })
    await controller.init()
    await controller.onKeyDown(HOME_SLOT_KEYS.large)
    expect(controller.getState().page).toBe(0)
    await controller.onKeyDown(NAV.NEXT)
    expect(controller.getState().page).toBe(1)
    await controller.onKeyDown(NAV.NEXT) // clamp (only 2 pages)
    expect(controller.getState().page).toBe(1)
    await controller.onKeyDown(NAV.PREV)
    expect(controller.getState().page).toBe(0)
  })
})

describe('optimistic reconciliation', () => {
  it('keeps the optimistic value until the server confirms or the deadline passes', async () => {
    let clock = 1000
    const getActive = jest
      .fn<Promise<ActiveMap>, []>()
      .mockResolvedValueOnce({}) // init: empty
      .mockResolvedValueOnce({}) // stale poll: server not caught up yet
      .mockResolvedValue({ large: 'jellyfish_palpatine_stream' }) // server caught up
    const client = fakeClient({ getActive: getActive as unknown as CuesheetClient['getActive'] })
    const device = new FakeDevice()
    const controller = new DeckController({ device, client, config: cfg, now: () => clock })
    await controller.init()

    // assign Palpatine (id 10) to large
    await controller.onKeyDown(HOME_SLOT_KEYS.large)
    await controller.onKeyDown(ITEM_KEYS[0]) // team 1
    await controller.onKeyDown(ITEM_KEYS[0]) // Palpatine
    expect(controller.getActive().large).toBe('jellyfish_palpatine_stream')

    // stale poll before deadline (deadline = 1000 + 2*2000 = 5000): keep optimistic
    clock = 2000
    await controller.refreshActive()
    expect(controller.getActive().large).toBe('jellyfish_palpatine_stream')

    // server confirms: pending clears, value stands
    clock = 3000
    await controller.refreshActive()
    expect(controller.getActive().large).toBe('jellyfish_palpatine_stream')
  })

  it('accepts server truth once the deadline passes', async () => {
    let clock = 1000
    const client = fakeClient({
      setActive: jest.fn(async () => ({ ok: true, status: 200 })),
      getActive: async () => ({}) as ActiveMap, // server never shows the optimistic value
    })
    const device = new FakeDevice()
    const controller = new DeckController({ device, client, config: cfg, now: () => clock })
    await controller.init()
    await controller.onKeyDown(HOME_SLOT_KEYS.large)
    await controller.onKeyDown(ITEM_KEYS[0])
    await controller.onKeyDown(ITEM_KEYS[0]) // optimistic large = palpatine
    expect(controller.getActive().large).toBe('jellyfish_palpatine_stream')

    clock = 6000 // past deadline 5000
    await controller.refreshActive()
    expect(controller.getActive().large).toBeUndefined() // accepted server truth
  })
})
