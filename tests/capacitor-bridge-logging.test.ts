import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Phase 8 audit ticket 09. Capacitor's bridge logs every plugin call's
   arguments before it runs them - Bridge.callPluginMethod passes
   `call.getData().toString()` to Logger.verbose - and Logger's only gate is
   capacitor.config.ts's loggingBehavior, which defaults to "log whenever the
   build is debuggable". The recovery key crosses that bridge now, and so did
   the journal's raw data key, the archive password and every written row
   before it. This is what keeps the setting from drifting back to the
   default the next time somebody edits the file. */

const root = new URL('../', import.meta.url);
const capacitorConfig = readFileSync(new URL('capacitor.config.ts', root), 'utf8');

describe('capacitor bridge logging', () => {
  it('is off in every build, not only in the ones that ship', () => {
    expect(capacitorConfig).toMatch(/loggingBehavior:\s*'none'/);
  });
});
