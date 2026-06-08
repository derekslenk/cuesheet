import type { CommandContext } from '../lib/types.js';
import { run as loadtestRun } from '../../../scripts/loadtest/index.js';

export async function run(argv: string[], _ctx: CommandContext): Promise<void> {
  await loadtestRun(argv);
}
