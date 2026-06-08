import type { CommandContext } from '../lib/types.js';
import { run as soakRun } from '../../../scripts/atomicWriteSoak.js';

export async function run(argv: string[], _ctx: CommandContext): Promise<void> {
  await soakRun(argv);
}
