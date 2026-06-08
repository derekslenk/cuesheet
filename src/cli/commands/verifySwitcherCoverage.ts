import type { CommandContext } from '../lib/types.js';
import { run as verifyCoverageRun } from '../../../scripts/verifySwitcherCoverage.js';

export async function run(argv: string[], _ctx: CommandContext): Promise<void> {
  await verifyCoverageRun(argv);
}
