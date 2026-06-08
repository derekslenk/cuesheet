/**
 * Side-effect bootstrap for the supervisor entry point.
 *
 * lib/constants reads `EVENT_KEY` at MODULE-EVAL time (to compute TABLE_NAMES),
 * so the project-root .env.local must be loaded into process.env BEFORE that
 * import runs. This module does exactly that and MUST be the FIRST import in
 * commands/supervisor.bun.ts — ahead of the lib/constants import.
 *
 * Why this exists: `next dev` and (via Bun's cwd auto-load) `cuesheet sup` run
 * from the project root already see .env.local. But `cuesheet sup` / `cuesheet
 * start` can be launched from any directory (e.g. dist/), where Bun's cwd
 * auto-load misses the repo's .env.local — leaving the supervisor on the default
 * EVENT_KEY/FILE_DIRECTORY while the webui uses the configured ones, so they
 * read/write DIFFERENT event tables. loadProjectEnvFiles() resolves the project
 * root explicitly (findProjectRoot) and fills the missing keys.
 */
import { loadProjectEnvFiles } from './env.js';

loadProjectEnvFiles(process.env);
