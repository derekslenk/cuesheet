/**
 * Single source of truth for the shipped version — read from package.json.
 *
 * Works in all three run modes: tsx/node read the JSON from disk at runtime,
 * jest resolves it via resolveJsonModule, and `bun build --compile` embeds it
 * into the binary at build time (so the compiled supervisor/CLI report the
 * version of the tree they were built from, not whatever is on disk).
 */
import pkg from '../package.json';

export const CUESHEET_VERSION: string = pkg.version;
