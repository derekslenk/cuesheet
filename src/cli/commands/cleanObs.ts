import type { CommandContext } from '../lib/types.js';
import { run as cleanObsRun } from '../../../scripts/cleanObsCollection.js';

export async function run(argv: string[], _ctx: CommandContext): Promise<void> {
  await cleanObsRun(argv);
}
