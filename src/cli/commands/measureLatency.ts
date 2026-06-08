import type { CommandContext } from '../lib/types.js';
import { run as measureLatencyRun } from '../../../scripts/measureSwitcherLatency.js';

export async function run(argv: string[], _ctx: CommandContext): Promise<void> {
  await measureLatencyRun(argv);
}
