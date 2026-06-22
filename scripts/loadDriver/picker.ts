/**
 * Round-robin picker over (streamId, screen) pairs.
 *
 * Stream-group-name derivation uses the shared buildStreamGroupName helper so
 * the driver predicts exactly what setActive will write to ${screen}.txt —
 * which the e2e timer needs to know in order to recognise the OBS plugin's switch.
 */

import { buildStreamGroupName } from '../../lib/streamGroupName';

export interface StreamRecord {
  id: number;
  name: string;
  team_name: string;
  group_name: string | null | undefined;
}

export interface Pick {
  streamId: number;
  screen: string;
  expectedGroupName: string;
}

function expectedGroupName(stream: StreamRecord): string {
  return buildStreamGroupName(stream);
}

export function createPicker(
  streams: readonly StreamRecord[],
  screens: readonly string[]
): () => Pick {
  if (streams.length === 0) {
    throw new Error('createPicker: streams must not be empty');
  }
  if (screens.length === 0) {
    throw new Error('createPicker: screens must not be empty');
  }

  let i = 0;
  return () => {
    const stream = streams[i % streams.length];
    const screen = screens[i % screens.length];
    i++;
    return {
      streamId: stream.id,
      screen,
      expectedGroupName: expectedGroupName(stream),
    };
  };
}
