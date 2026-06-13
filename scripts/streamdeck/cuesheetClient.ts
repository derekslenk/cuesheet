// Typed, resilient HTTP client for the cuesheet API. Every call is non-throwing:
// on network error / timeout / non-2xx it returns a sane fallback and logs a warning
// (mirrors lib/supervisorClient.ts). Localhost calls bypass auth (middleware.ts).
import type { Slot, Stream, Team } from './types.js'

export type SceneName = '1-Screen' | '2-Screen' | '4-Screen'
export type ActiveMap = Partial<Record<Slot, string | null>>

export interface SetActiveResult {
  ok: boolean
  /** HTTP status, or 0 on network error / timeout. */
  status: number
}

export interface CuesheetClient {
  getActive(): Promise<ActiveMap | null>
  getStreams(): Promise<Stream[]>
  getTeams(): Promise<Team[]>
  setActive(slot: Slot, id: number): Promise<SetActiveResult>
  setScene(sceneName: SceneName): Promise<boolean>
  triggerTransition(): Promise<boolean>
}

export interface ClientDeps {
  baseUrl: string
  timeoutMs?: number
  /** Injectable for tests; defaults to global fetch (Node 22+). */
  fetchImpl?: typeof fetch
  log?: (msg: string) => void
}

interface RawResponse {
  status: number
  body: unknown
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const ok2xx = (status: number): boolean => status >= 200 && status < 300

/** Unwrap the `{ success, data }` envelope; tolerate the legacy bare shape. */
function unwrap<T>(body: unknown, fallback: T): T {
  if (isObj(body) && 'data' in body) {
    const data = (body as { data?: unknown }).data
    return (data ?? fallback) as T
  }
  return (body ?? fallback) as T
}

export function createClient(deps: ClientDeps): CuesheetClient {
  const { baseUrl, timeoutMs = 4000, fetchImpl = fetch, log = () => {} } = deps

  async function req(path: string, init?: RequestInit): Promise<RawResponse | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, { ...init, signal: controller.signal })
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        // non-JSON or empty body is fine for action endpoints
      }
      return { status: res.status, body }
    } catch (err) {
      log(`[deck] ${init?.method ?? 'GET'} ${path} failed: ${err instanceof Error ? err.message : String(err)}`)
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  const jsonPost = (payload: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return {
    async getActive() {
      const r = await req('/api/getActive')
      if (!r || r.status >= 400) return null
      return unwrap<ActiveMap>(r.body, {})
    },

    async getStreams() {
      const r = await req('/api/streams')
      if (!r || r.status >= 400) return []
      const data = unwrap<Stream[]>(r.body, [])
      return Array.isArray(data) ? data : []
    },

    async getTeams() {
      const r = await req('/api/teams')
      if (!r || r.status >= 400) return []
      const data = unwrap<Team[]>(r.body, [])
      return Array.isArray(data) ? data : []
    },

    async setActive(slot, id) {
      const r = await req('/api/setActive', jsonPost({ screen: slot, id }))
      if (!r) return { ok: false, status: 0 }
      return { ok: ok2xx(r.status), status: r.status }
    },

    async setScene(sceneName) {
      const r = await req('/api/setScene', jsonPost({ sceneName }))
      return !!r && ok2xx(r.status)
    },

    async triggerTransition() {
      const r = await req('/api/triggerTransition', { method: 'POST' })
      return !!r && ok2xx(r.status)
    },
  }
}
