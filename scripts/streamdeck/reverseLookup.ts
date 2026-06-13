// Resolve the group-name strings returned by GET /api/getActive back to stream
// ids, using the canonical buildStreamGroupName formula (group_name || team_name).
// Reusing the shared helper avoids the team_name-only drift bug in app/page.tsx.
import { buildStreamGroupName } from '../../lib/streamGroupName.js'
import type { Stream } from './types.js'

/** Build a Map from stream-group name (what getActive returns) to stream id. */
export function buildReverseIndex(streams: readonly Stream[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const s of streams) {
    const key = buildStreamGroupName({
      name: s.name,
      team_name: s.team_name,
      group_name: s.group_name,
    })
    index.set(key, s.id)
  }
  return index
}

/** Resolve a getActive value (a group-name string, null, or undefined) to a stream id, or null. */
export function streamIdForActive(
  groupName: string | null | undefined,
  index: Map<string, number>,
): number | null {
  if (!groupName) return null
  return index.get(groupName) ?? null
}
