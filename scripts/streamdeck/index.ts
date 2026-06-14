// Entry point for the Stream Deck control sidecar. Run with:  npm run deck
// (i.e. tsx scripts/streamdeck/index.ts). Node-only — deliberately NOT a `cuesheet`
// subcommand, so the native HID dependency never enters the bun --compile graph.
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from './config.js'
import { createClient } from './cuesheetClient.js'
import { openDeckDevice, DeckUnavailableError, type DeckDevice } from './deckDevice.js'
import { DeckController } from './deckController.js'
import { acquireLock, DeckLockHeldError } from './singleInstance.js'

const log = (msg: string) => console.log(msg)

const EXIT = { LOCK_HELD: 11, DEVICE_BUSY: 12, NO_DEVICE: 13, FATAL: 1 } as const

async function main(): Promise<void> {
  const config = loadConfig()
  const lockPath = join(process.env.DECK_LOCK_DIR || tmpdir(), 'cuesheet-deck.lock')

  let release: () => void
  try {
    release = acquireLock(lockPath)
  } catch (err) {
    if (err instanceof DeckLockHeldError) {
      console.error(`[deck] ${err.message}`)
      process.exit(EXIT.LOCK_HELD)
    }
    throw err
  }

  let device: DeckDevice
  try {
    device = await openDeckDevice()
  } catch (err) {
    release()
    if (err instanceof DeckUnavailableError) {
      console.error(`[deck] ${err.message}`)
      process.exit(err.reason === 'busy' ? EXIT.DEVICE_BUSY : EXIT.NO_DEVICE)
    }
    throw err
  }

  const client = createClient({ baseUrl: config.baseUrl, timeoutMs: config.requestTimeoutMs, log })
  const controller = new DeckController({ device, client, config, log })

  // Shared teardown: stop polling, blank + release the device, drop the lock.
  // Used by BOTH the signal handlers and the startup-failure path, so a throw
  // during start() can never leak cuesheet-deck.lock or leave the panel lit
  // (previously a start() error went straight to main().catch() → exit(FATAL)
  // without releasing either).
  const teardown = async (): Promise<void> => {
    try {
      await controller.stop()
    } catch {
      /* ignore */
    }
    try {
      await device.clearPanel()
      await device.close()
    } catch {
      /* ignore */
    }
    release()
  }

  try {
    await controller.start()
  } catch (err) {
    await teardown()
    throw err
  }
  log(`[deck] running against ${config.baseUrl} — press keys on the deck, Ctrl-C to stop.`)

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    log(`[deck] ${signal} — releasing device...`)
    await teardown()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  // Optional self-terminating smoke mode for verification (DECK_SMOKE_MS=6000).
  const smokeMs = Number(process.env.DECK_SMOKE_MS)
  if (Number.isFinite(smokeMs) && smokeMs > 0) {
    log(`[deck] smoke mode — auto-stop in ${smokeMs}ms`)
    setTimeout(() => void shutdown('SMOKE'), smokeMs)
  }
}

main().catch((err) => {
  console.error('[deck] fatal:', err instanceof Error ? err.stack ?? err.message : err)
  process.exit(EXIT.FATAL)
})
