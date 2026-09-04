/* TRYOUT_FELT_SENSE_TABLES is a live query's seed (journal.svelte.ts, phase
   8 audit ticket 14): a table added to either read the per-tryout
   felt-sense query makes has to reach the seed without a second edit here.

   A separate file from liveTiles.test.ts: `vi.mock` below replaces
   `./live/writes` for every import in this file, and the point is to prove
   the constant is *computed* from `tablesReadBy` rather than restate the
   registry's current values, which a hand-written pair would pass just as
   well (the registry test rule ticket 21 already learned from). */
import { afterEach, expect, test, vi } from 'vitest';

const SENTINEL = 'zzzNewlyRegisteredTable';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./live/writes');
});

/* Timed out at the default 5000ms once under the full suite's own transform
   load - `liveTiles.ts` pulls in enough of the module graph (paraglide,
   the dose/regimen/wearSessions helpers, the unprompted registry) that a
   fresh, uncached dynamic import of it can outrun that budget when every
   other test file is transforming at the same time. 20s is nowhere near
   what this needs alone; it is headroom against that contention. */
test(
  'a table the registry adds to either read reaches TRYOUT_FELT_SENSE_TABLES unedited',
  async () => {
    vi.doMock('./live/writes', () => ({
      tablesReadBy: (area: string) => (area === 'feltSense' ? ['feltSense', 'tryout', SENTINEL] : ['tryout'])
    }));

    const { TRYOUT_FELT_SENSE_TABLES } = await import('./liveTiles.ts');

    expect(TRYOUT_FELT_SENSE_TABLES).toContain(SENTINEL);
    expect(TRYOUT_FELT_SENSE_TABLES).toEqual(expect.arrayContaining(['tryout', 'feltSense']));
  },
  20_000
);

test(
  'TRYOUT_FELT_SENSE_TABLES has no duplicate',
  async () => {
    vi.doMock('./live/writes', () => ({
      tablesReadBy: () => ['tryout', 'tryout']
    }));

    const { TRYOUT_FELT_SENSE_TABLES } = await import('./liveTiles.ts');

    expect(TRYOUT_FELT_SENSE_TABLES.length).toBe(new Set(TRYOUT_FELT_SENSE_TABLES).size);
  },
  20_000
);
