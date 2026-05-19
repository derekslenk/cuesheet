/**
 * Derives the stream-group name that setActive writes to the switcher file.
 *
 * Keep this in sync with app/api/setActive/route.ts:46-49.
 */

export interface StreamGroupInput {
  name: string;
  team_name: string | null;
  group_name: string | null;
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
