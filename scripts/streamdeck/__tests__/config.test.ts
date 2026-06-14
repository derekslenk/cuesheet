import { loadConfig } from '../config.js'

describe('loadConfig', () => {
  it('uses defaults when env is empty', () => {
    const c = loadConfig({})
    expect(c.baseUrl).toBe('http://localhost:3000')
    expect(c.pollMs).toBe(2000)
    expect(c.rosterRefreshMs).toBe(45000)
    expect(c.brightness).toBe(80)
    expect(c.requestTimeoutMs).toBe(4000)
  })

  it('reads overrides and strips trailing slashes from baseUrl', () => {
    const c = loadConfig({
      CUESHEET_URL: 'http://host:3001/',
      DECK_POLL_MS: '1000',
      DECK_ROSTER_REFRESH_MS: '60000',
      DECK_BRIGHTNESS: '50',
      DECK_REQUEST_TIMEOUT_MS: '2500',
    })
    expect(c.baseUrl).toBe('http://host:3001')
    expect(c.pollMs).toBe(1000)
    expect(c.rosterRefreshMs).toBe(60000)
    expect(c.brightness).toBe(50)
    expect(c.requestTimeoutMs).toBe(2500)
  })

  it('clamps brightness to [0,100] and ignores non-numeric values', () => {
    expect(loadConfig({ DECK_BRIGHTNESS: '500' }).brightness).toBe(100)
    expect(loadConfig({ DECK_BRIGHTNESS: '-5' }).brightness).toBe(0)
    expect(loadConfig({ DECK_POLL_MS: 'abc' }).pollMs).toBe(2000)
    expect(loadConfig({ DECK_POLL_MS: '' }).pollMs).toBe(2000)
  })
})
