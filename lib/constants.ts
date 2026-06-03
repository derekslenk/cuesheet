// Base table names
export const BASE_TABLE_NAMES = {
    STREAMS: 'streams',
    TEAMS: 'teams',
} as const;

type BaseTableName = typeof BASE_TABLE_NAMES[keyof typeof BASE_TABLE_NAMES];

/**
 * Event key — the per-event suffix appended to the base table names so that
 * one CueSheet build serves any event by setting EVENT_KEY in the environment
 * (no source edit, no recompile). A single opaque identifier replaces the old
 * year/season/suffix triple. The webui (writer) and the streamlink supervisor
 * (reader) both read this value, so they resolve identical table names with no
 * coordination.
 *
 * Default `2026_summer_sat` keeps the resolved names byte-identical to the
 * historical year/season/suffix output (`streams_2026_summer_sat` /
 * `teams_2026_summer_sat`), so adopting EVENT_KEY is a no-op for the existing
 * database — no migration required.
 *
 * Convention: lowercase letters, digits, and underscores (e.g. `worlds_2027`,
 * `2026_summer_sat`). Validated below so it is safe to interpolate into a SQL
 * identifier; an invalid value fails fast at startup rather than silently
 * pointing the app at the wrong (or a non-existent) table.
 */
export const DEFAULT_EVENT_KEY = '2026_summer_sat';
const EVENT_KEY_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

function resolveEventKey(): string {
    const raw = process.env.EVENT_KEY;
    if (raw === undefined || raw === '') return DEFAULT_EVENT_KEY;
    if (!EVENT_KEY_PATTERN.test(raw)) {
        throw new Error(
            `EVENT_KEY=${raw} is invalid; use lowercase letters, digits, and ` +
            `underscores (e.g. "2026_summer_sat", "worlds_2027")`
        );
    }
    return raw;
}

export const EVENT_KEY = resolveEventKey();

/**
 * Generates a full table name as `<base>_<eventKey>`.
 * @param baseTableName - The base table name (`streams` or `teams`)
 * @param eventKey - Override the active EVENT_KEY. Pass an explicit key only
 *   for historical / cross-event lookups (e.g. one-off migration scripts that
 *   target a prior event's tables); runtime code should omit it so every table
 *   name follows the configured EVENT_KEY.
 * @returns The full table name, e.g. `streams_2026_summer_sat`
 */
export function getTableName(
    baseTableName: BaseTableName,
    eventKey: string = EVENT_KEY
): string {
    return `${baseTableName}_${eventKey}`;
}

// Export commonly used full table names for the active event.
export const TABLE_NAMES = {
    STREAMS: getTableName(BASE_TABLE_NAMES.STREAMS),
    TEAMS: getTableName(BASE_TABLE_NAMES.TEAMS),
} as const;

// Screen position constants
export const SCREEN_POSITIONS = [
    'large',
    'left', 
    'right',
    'top_left',
    'top_right',
    'bottom_left',
    'bottom_right'
] as const;

/**
 * Canonical OBS input names for the 7 obs-source-switcher inputs in the
 * stream-a-thon scene collection. These names are the OBS source/input
 * identifiers used by:
 *   - lib/obsClient.js (removeSourceFromSwitcher, addSourceToSwitcher)
 *   - app/api/addStream/route.ts (per-screen switcher updates)
 * They must stay in sync with the production scene-collection JSON
 * (obs-scene/SaT.json — search for `"id": "source_switcher"`).
 *
 * NOTE: These are OBS input NAMES (with ss_ prefix), NOT file paths.
 * The files the plugin polls are at ${FILE_DIRECTORY}/${screen}.txt
 * (no ss_ prefix). See SCREEN_POSITIONS above for those file basenames.
 */
export const SOURCE_SWITCHER_NAMES = [
    'ss_large',
    'ss_left', 
    'ss_right',
    'ss_top_left',
    'ss_top_right',
    'ss_bottom_left',
    'ss_bottom_right'
] as const;

// OBS utility functions
export function cleanObsName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '_');
}

