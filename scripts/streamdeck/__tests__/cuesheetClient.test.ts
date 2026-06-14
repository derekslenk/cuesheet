import { createClient } from '../cuesheetClient.js'

/** Minimal Response stub — the client only uses .status and .json(). */
const res = (status: number, body: unknown): Response =>
  ({ status, json: async () => body }) as unknown as Response

describe('cuesheetClient reads', () => {
  it('getActive unwraps the {success,data} envelope', async () => {
    const fetchImpl = jest.fn(async () =>
      res(200, { success: true, data: { large: 'jellyfish_palpatine_stream', left: null } }),
    )
    const c = createClient({ baseUrl: 'http://x', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(await c.getActive()).toEqual({ large: 'jellyfish_palpatine_stream', left: null })
    expect(fetchImpl).toHaveBeenCalledWith('http://x/api/getActive', expect.objectContaining({ signal: expect.anything() }))
  })

  it('getStreams handles wrapped, bare, and failure responses', async () => {
    const wrapped = createClient({ baseUrl: 'http://x', fetchImpl: (async () => res(200, { success: true, data: [{ id: 1 }] })) as unknown as typeof fetch })
    expect(await wrapped.getStreams()).toEqual([{ id: 1 }])

    const bare = createClient({ baseUrl: 'http://x', fetchImpl: (async () => res(200, [{ id: 2 }])) as unknown as typeof fetch })
    expect(await bare.getStreams()).toEqual([{ id: 2 }])

    const failed = createClient({ baseUrl: 'http://x', fetchImpl: (async () => res(500, null)) as unknown as typeof fetch })
    expect(await failed.getStreams()).toEqual([])
  })

  it('getActive returns null on server error', async () => {
    const c = createClient({ baseUrl: 'http://x', fetchImpl: (async () => res(503, null)) as unknown as typeof fetch })
    expect(await c.getActive()).toBeNull()
  })
})

describe('cuesheetClient writes', () => {
  it('setActive posts {screen,id} and maps 2xx to ok', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return res(200, { message: 'updated' })
    }) as unknown as typeof fetch
    const c = createClient({ baseUrl: 'http://x', fetchImpl })
    expect(await c.setActive('top_left', 42)).toEqual({ ok: true, status: 200 })
    expect(calls[0].url).toBe('http://x/api/setActive')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ screen: 'top_left', id: 42 })
  })

  it('setActive reports not-ok on 400 and status 0 on network error', async () => {
    const c400 = createClient({ baseUrl: 'http://x', fetchImpl: (async () => res(400, { error: 'Stream not found' })) as unknown as typeof fetch })
    expect(await c400.setActive('large', 9)).toEqual({ ok: false, status: 400 })

    const cNet = createClient({ baseUrl: 'http://x', fetchImpl: (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch })
    expect(await cNet.setActive('large', 9)).toEqual({ ok: false, status: 0 })
  })

  it('setScene posts {sceneName}', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const c = createClient({ baseUrl: 'http://x', fetchImpl: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return res(200, {}) }) as unknown as typeof fetch })
    expect(await c.setScene('2-Screen')).toBe(true)
    expect(calls[0].url).toBe('http://x/api/setScene')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ sceneName: '2-Screen' })
  })

  it('triggerTransition posts with no body; false when OBS rejects (e.g. studio mode off)', async () => {
    const okClient = createClient({ baseUrl: 'http://x', fetchImpl: (async () => res(200, {})) as unknown as typeof fetch })
    expect(await okClient.triggerTransition()).toBe(true)

    const offClient = createClient({ baseUrl: 'http://x', fetchImpl: (async () => res(400, { error: 'studio mode disabled' })) as unknown as typeof fetch })
    expect(await offClient.triggerTransition()).toBe(false)
  })
})

describe('cuesheetClient resilience', () => {
  it('aborts slow requests and returns the fallback', async () => {
    // fetch never resolves but honors the abort signal -> timeout fires -> fallback
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as unknown as typeof fetch
    const c = createClient({ baseUrl: 'http://x', timeoutMs: 20, fetchImpl })
    expect(await c.getActive()).toBeNull()
    expect(await c.getStreams()).toEqual([])
    expect(await c.setActive('large', 1)).toEqual({ ok: false, status: 0 })
  })
})
