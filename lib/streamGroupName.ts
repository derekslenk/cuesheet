/**
 * Derives the stream-group name that setActive writes to the switcher file.
 *
 * This is the single source of truth for the `group_name || team_name`
 * naming rule — setActive and every other producer/consumer of switcher
 * names call this helper rather than re-implementing the formula.
 */

export interface StreamGroupInput {
  name: string;
  team_name: string | null;
  group_name?: string | null;
}

/**
 * Returns the stream-group name for a given stream row, e.g.
 * `jellyfish_palpatine_stream`.
 */
export function buildStreamGroupName(stream: StreamGroupInput): string {
  const groupName = stream.group_name || stream.team_name || '';
  const cleanGroupName = groupName.toLowerCase().replace(/\s+/g, '_');
  const cleanStreamName = stream.name.toLowerCase().replace(/\s+/g, '_');
  return `${cleanGroupName}_${cleanStreamName}_stream`;
}
