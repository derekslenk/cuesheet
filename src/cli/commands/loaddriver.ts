import type { CommandContext } from '../lib/types.js';
import { run as loadDriverRun } from '../../../scripts/loadDriver.js';

export async function run(argv: string[], _ctx: CommandContext): Promise<void> {
  await loadDriverRun(argv);
}
