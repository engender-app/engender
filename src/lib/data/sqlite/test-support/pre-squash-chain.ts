/* The chain as development builds ran the v88 baseline, then migrations 89 to 119 one
   transaction each. No release runs it. Tests that drive one of those steps from the state
   before it, or build a development journal at a version between 88 and 119, use this. The
   steps released after 119 follow, so the chain still ends at the latest schema. */

import type { Migration } from '../migration-runner.ts';
import { migrations, POST_RC1_STEPS } from '../migrations.ts';

export const preSquashChain: Migration[] = [
  migrations[0],
  ...POST_RC1_STEPS,
  ...migrations.filter((migration) => migration.version > 119)
];
