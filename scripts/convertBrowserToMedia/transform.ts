// Imported as JS from streamInputConfig.js — single source of truth for the
// ffmpeg_source settings shape across V2 createStreamGroup and this script.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildFfmpegSourceSettings } = require('../../lib/streamInputConfig');

export interface ConversionMapping {
  [sourceName: string]: string;
}

export interface ConversionChange {
  name: string;
  from: 'browser_source';
  to: 'ffmpeg_source';
  twitchUrl: string;
  obsInputUrl: string;
}

export interface ConversionWarning {
  name: string;
  reason: string;
}

export interface ConversionDiffEntry {
  name: string;
  before: { id: string; url: string };
  after: { id: string; input: string };
}

export interface ConversionDiff {
  changed: ConversionDiffEntry[];
  unchanged_browser_sources: string[];
}

interface SceneSource {
  id?: string;
  versioned_id?: string;
  name?: string;
  settings?: Record<string, unknown>;
  [k: string]: unknown;
}

interface SceneCollection {
  sources?: SceneSource[];
  [k: string]: unknown;
}

export interface ConversionResult {
  converted: SceneCollection & { sources: SceneSource[] };
  changes: ConversionChange[];
  warnings: ConversionWarning[];
  diff: ConversionDiff;
}

export function convertSceneJson(
  scene: SceneCollection,
  mapping: ConversionMapping
): ConversionResult {
  const cloned: SceneCollection & { sources: SceneSource[] } = JSON.parse(JSON.stringify(scene));
  if (!Array.isArray(cloned.sources)) cloned.sources = [];

  const changes: ConversionChange[] = [];
  const warnings: ConversionWarning[] = [];
  const diffChanged: ConversionDiffEntry[] = [];
  const unchangedBrowserSources: string[] = [];

  for (const source of cloned.sources) {
    if (source.id !== 'browser_source') continue;

    const name = String(source.name ?? '');
    const oldUrl = String((source.settings as { url?: unknown } | undefined)?.url ?? '');
    const udpUrl = mapping[name];

    if (!udpUrl) {
      warnings.push({ name, reason: 'no UDP mapping provided' });
      unchangedBrowserSources.push(name);
      continue;
    }

    source.id = 'ffmpeg_source';
    source.versioned_id = 'ffmpeg_source';
    source.settings = buildFfmpegSourceSettings(udpUrl);

    changes.push({
      name,
      from: 'browser_source',
      to: 'ffmpeg_source',
      twitchUrl: oldUrl,
      obsInputUrl: udpUrl,
    });
    diffChanged.push({
      name,
      before: { id: 'browser_source', url: oldUrl },
      after: { id: 'ffmpeg_source', input: udpUrl },
    });
  }

  return {
    converted: cloned,
    changes,
    warnings,
    diff: { changed: diffChanged, unchanged_browser_sources: unchangedBrowserSources },
  };
}
