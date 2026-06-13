// The ONLY transport-specific module. Wraps @elgato-stream-deck/node behind a
// minimal interface so the controller (and its tests, via a fake) never touch HID.
// Swapping to a different transport later means reimplementing only this file.
import { listStreamDecks, openStreamDeck, type StreamDeck } from '@elgato-stream-deck/node'

export interface DeckDevice {
  readonly keyCount: number
  fillKeyBuffer(index: number, buffer: Uint8Array, opts: { format: 'rgba' }): Promise<void>
  clearKey(index: number): Promise<void>
  clearPanel(): Promise<void>
  setBrightness(percentage: number): Promise<void>
  /** Normalized key-down: emits the flat button index (v7 emits a control object). */
  onDown(cb: (index: number) => void): void
  onError(cb: (err: unknown) => void): void
  close(): Promise<void>
}

export type DeckOpenFailure = 'no-device' | 'busy'

export class DeckUnavailableError extends Error {
  readonly reason: DeckOpenFailure
  constructor(reason: DeckOpenFailure, cause?: unknown) {
    super(
      reason === 'no-device'
        ? 'No Stream Deck found — is it plugged in, or is the Elgato app holding it?'
        : 'Stream Deck is busy — close the Elgato Stream Deck app and retry.',
    )
    this.name = 'DeckUnavailableError'
    this.reason = reason
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause
  }
}

/** Adapt a concrete StreamDeck instance to the DeckDevice interface. */
export function wrapStreamDeck(sd: StreamDeck): DeckDevice {
  const buttons = sd.CONTROLS.filter((c) => c.type === 'button')
  return {
    keyCount: buttons.length,
    fillKeyBuffer: (index, buffer, opts) => sd.fillKeyBuffer(index, buffer, opts),
    clearKey: (index) => sd.clearKey(index),
    clearPanel: () => sd.clearPanel(),
    setBrightness: (pct) => sd.setBrightness(pct),
    onDown: (cb) => sd.on('down', (control) => cb(control.index)),
    onError: (cb) => sd.on('error', cb),
    close: () => sd.close(),
  }
}

/** Open the first connected Stream Deck, or throw DeckUnavailableError. */
export async function openDeckDevice(): Promise<DeckDevice> {
  const devices = await listStreamDecks()
  if (devices.length === 0) throw new DeckUnavailableError('no-device')
  let sd: StreamDeck
  try {
    sd = await openStreamDeck(devices[0].path, { resetToLogoOnClose: true })
  } catch (err) {
    throw new DeckUnavailableError('busy', err)
  }
  return wrapStreamDeck(sd)
}
