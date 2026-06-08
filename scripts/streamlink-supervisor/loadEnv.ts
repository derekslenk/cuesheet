/**
 * Load the SAME environment the Next.js webui sees, BEFORE any module that
 * reads process.env at import time (lib/constants → EVENT_KEY, lib/database →
 * FILE_DIRECTORY).
 *
 * `next dev`/`next start` auto-load .env and .env.local; the supervisor's tsx
 * process does NOT. Without this it falls back to defaults (FILE_DIRECTORY →
 * ./files), so it opens a DIFFERENT sources.db than the webui writes to and
 * ends up supervising zero streams. Using @next/env (already a Next dependency)
 * replicates Next's exact file precedence — .env.local wins — so the two
 * processes can never drift on FILE_DIRECTORY, EVENT_KEY, or anything else.
 *
 * This runs its work as an import side effect and MUST be the first import in
 * the supervisor entrypoint (before lib/database and lib/constants).
 */
import { loadEnvConfig } from '@next/env';
import path from 'path';
import { fileURLToPath } from 'url';

// Project root is two levels up from scripts/streamlink-supervisor/.
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadEnvConfig(projectDir, process.env.NODE_ENV !== 'production');
