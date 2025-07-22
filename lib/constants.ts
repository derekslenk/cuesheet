// Base table names
export const BASE_TABLE_NAMES = {
    STREAMS: 'streams',
    TEAMS: 'teams',
} as const;

// Table configuration interface
export interface TableConfig {
    year: number;
    season: 'spring' | 'summer' | 'fall' | 'winter';
    suffix?: string;
}

// Default configuration
export const DEFAULT_TABLE_CONFIG: TableConfig = {
    year: 2025,
    season: 'summer',
    suffix: 'sat'
};

/**
 * Generates a full table name using the provided configuration
 * @param baseTableName - The base table name (e.g., 'streams' or 'teams')
 * @param config - Optional configuration object. If not provided, uses DEFAULT_TABLE_CONFIG
 * @returns The full table name with year, season, and suffix
 */
export function getTableName(
    baseTableName: typeof BASE_TABLE_NAMES[keyof typeof BASE_TABLE_NAMES],
    config: Partial<TableConfig> = {}
): string {
    const finalConfig = {...DEFAULT_TABLE_CONFIG, ...config};
    const suffix = finalConfig.suffix ? `_${finalConfig.suffix}` : '';

    return `${baseTableName}_${finalConfig.year}_${finalConfig.season}${suffix}`;
}

// Export commonly used full table names with default configuration
export const TABLE_NAMES = {
    STREAMS: getTableName(BASE_TABLE_NAMES.STREAMS),
    TEAMS: getTableName(BASE_TABLE_NAMES.TEAMS),
} as const;

// Screen position constants
export const SCREEN_POSITIONS = [
    'large',
    'left', 
    'right',
    'topLeft',
    'topRight',
    'bottomLeft',
    'bottomRight'
] as const;

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

