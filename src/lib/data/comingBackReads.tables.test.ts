/* WAITING_TABLES is a live query's seed (journal.svelte.ts, phase 8 audit
   ticket 14), and the whole point of seeding from a registry rather than a
   hand-written list is that a table added to one of the five reads
   `readWhatIsWaiting` makes reaches the seed without a second edit here.

   A separate file from comingBackReads.test.ts: `vi.mock` below replaces
   `./live/writes` for every import in this file, and the point is to prove
   WAITING_TABLES is *computed* from `tablesReadBy` rather than restate the
   real registry's current values, which would pass just as well hard-coded
   (the registry test rule ticket 21 already learned from). */
import { afterEach, expect, test, vi } from 'vitest';

const SENTINEL = 'zzzNewlyRegisteredTable';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./live/writes');
});

/* Timed out at the default 5000ms once under the full suite's own transform
   load - a fresh, uncached dynamic import can outrun that budget when every
   other test file is transforming at the same time (liveTiles.tables.test.ts
   hit the same thing). 20s is headroom against that contention, not what
   either test needs alone. */
test(
  'a table the registry adds to one of the five reads reaches WAITING_TABLES unedited',
  async () => {
    vi.doMock('./live/writes', () => ({
      tablesReadBy: (area: string, operation: string) =>
        operation === 'getComparison' ? ['dose', 'regimen', SENTINEL] : [`${area}.${operation}`]
    }));

    const { WAITING_TABLES } = await import('./comingBackReads.ts');

    expect(WAITING_TABLES).toContain(SENTINEL);
    expect(WAITING_TABLES).toEqual(
      expect.arrayContaining([
        'letters.getLetters',
        'milestones.getMilestones',
        'eras.getEras',
        'wearSessions.getRunningSession',
        'dose',
        'regimen'
      ])
    );
  },
  20_000
);

test(
  'WAITING_TABLES has no duplicate and no table of its own',
  async () => {
    vi.doMock('./live/writes', () => ({
      tablesReadBy: () => ['entry', 'entry']
    }));

    const { WAITING_TABLES } = await import('./comingBackReads.ts');

    assertNoDuplicates(WAITING_TABLES);
  },
  20_000
);

function assertNoDuplicates(tables: string[]) {
  expect(tables.length).toBe(new Set(tables).size);
}
