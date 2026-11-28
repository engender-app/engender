/* Shared navigation and query arrival guards. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const ui = read('src/lib/stores/ui.svelte.ts');
const live = read('src/lib/data/live/journal.svelte.ts');
const transition = read('src/lib/navigation/navigationTransition.ts');

describe('the screen says when it is still', () => {
  it('is still when neither a view transition nor an Android tab arrival is moving', () => {
    expect(ui).toMatch(/screenMoving: false/);
    expect(ui).toMatch(/export const screenStill = \(\) => !ui\.screenMoving && !ui\.tabMoving;/);
  });

  /* A second navigation skips the first transition, whose `finished` then
     settles after the second has started; only the current transition may
     call the screen still, as it is the only one that may clear data-nav. */
  it('moves with the current transition and stops only when that one finishes', () => {
    expect(transition).toMatch(/currentTransition = transition;\n\s+ui\.screenMoving = true;/);
    expect(transition).toMatch(/if \(currentTransition === transition\) \{\n\s+currentTransition = null;\n\s+ui\.screenMoving = false;/);
  });
});

describe('a query can wait for a condition before it runs', () => {
  it('does not start a run while the condition is false, and runs when it turns true', () => {
    expect(live).toMatch(/export function liveQueryWhen<T>\(when: \(\) => boolean, run: \(journal: Journal\) => Promise<T>\): LiveQuery<T>/);
    /* Before `++latest`, the way a query waits for the journal to open, so
       the run it eventually makes is still its first-ever attempt and keeps
       that attempt's retry. */
    const opened = live.indexOf('if (!ready) return;');
    const waits = live.indexOf('if (!started && !when()) return;');
    expect(waits).toBeGreaterThan(opened);
    expect(waits).toBeLessThan(live.indexOf('started = true;'));
    expect(live.indexOf('started = true;')).toBeLessThan(live.indexOf('const mine = ++latest;'));
  });

  /* Asked on every run, a flip of `when` after the first answer re-ran the
     read, and the effect's cleanup dropped an answer still in flight. */
  it('asks `when` only until the first run has started', () => {
    expect(live).toMatch(/if \(!started && !when\(\)\) return;\s+started = true;/);
    expect(live.match(/when\(\)/g)).toHaveLength(1);
  });
});

describe('the arrival hold', () => {
  it('holds a view transition on Android, at ready, unless motion is reduced', () => {
    expect(transition).toMatch(/transition\.ready\.then\(\(\) => \{[\s\S]{0,400}?if \(isAndroid\(\) && !isReducedMotion\(\)\) holdUntilPainted\(document\);/);
  });
});
