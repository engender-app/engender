/* The deferred-area seam itself (phase 9 audit ticket 03): that a facade
   built from a list of names answers to all of them, loads nothing until one
   is called, and builds the area exactly once however many calls arrive.

   Driven against a hand-made area rather than a real one, for the reason
   flatArea.test.ts gives about its throwaway table - what is under test is
   the machinery, and a real area would also be exercising that area's own
   decisions. The last two tests are the exception: they check the real
   journal's deferred areas offer every method their eager form does, which
   is the fact no other test can see. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { deferredArea } from './deferredArea.ts';
import { openJournal } from './journal.ts';
import { makeArchiveArea } from './archive.ts';
import { makeHormoneCurveArea } from './hormoneCurve.ts';
import { makeDosesArea } from './doses.ts';
import { makeRegimenArea } from './regimen.ts';
import { makeLabsArea } from './labs.ts';

interface Counter {
  add(n: number): Promise<number>;
  total(): Promise<number>;
}

/** An area whose construction is observable, and which holds state across
    calls the way hormoneCurve's two model caches do. */
function countingArea() {
  let built = 0;
  const load = async () => {
    built += 1;
    let sum = 0;
    return {
      async add(n: number) {
        sum += n;
        return sum;
      },
      async total() {
        return sum;
      }
    } satisfies Counter;
  };
  return { load, builds: () => built };
}

test('the facade answers to every name it was given, and builds nothing until one is called', async () => {
  const { load, builds } = countingArea();
  const area = deferredArea<Counter>(load)(['add', 'total']);

  assert.deepEqual(Object.keys(area).sort(), ['add', 'total']);
  assert.equal(builds(), 0);

  assert.equal(await area.total(), 0);
  assert.equal(builds(), 1);
});

test('a call passes its arguments through and answers with what the area answered', async () => {
  const { load } = countingArea();
  const area = deferredArea<Counter>(load)(['add', 'total']);

  assert.equal(await area.add(2), 2);
  assert.equal(await area.add(3), 5);
});

/* The reason the area is memoized rather than the import: a dynamic import
   already resolves from the module loader's cache (archive.ts says the same
   about `restore`), but calling the factory again would hand back a second
   area with empty caches - hormoneCurve's two model memos are exactly that. */
test('the area is built once however many calls arrive, including concurrent ones', async () => {
  const { load, builds } = countingArea();
  const area = deferredArea<Counter>(load)(['add', 'total']);

  await Promise.all([area.add(1), area.add(1), area.add(1)]);

  assert.equal(builds(), 1);
  assert.equal(await area.total(), 3);
});

test('a load that failed is retried rather than remembered', async () => {
  let attempts = 0;
  const area = deferredArea<Counter>(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('chunk gone');
    let sum = 0;
    return {
      async add(n: number) {
        sum += n;
        return sum;
      },
      async total() {
        return sum;
      }
    };
  })(['add', 'total']);

  await assert.rejects(area.add(1), /chunk gone/);
  assert.equal(await area.add(1), 1);
});

/* What the type-level check cannot say out loud. A name missing from the
   list is a compile error at the call site, but a compile error is not a
   failing test, and the whole point of the facade is that everything above
   it - writes.ts's classification walk first of all - sees the same set of
   methods it would have seen eagerly. */
test('every method of the eager archive and hormoneCurve areas is on the deferred facade', async () => {
  const driver = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(driver, files);

  const regimen = makeRegimenArea(driver);
  const doses = makeDosesArea(driver, regimen);
  const eager = {
    archive: makeArchiveArea(driver, files),
    hormoneCurve: makeHormoneCurveArea(doses, regimen, makeLabsArea(driver, regimen))
  };

  for (const [name, area] of Object.entries(eager)) {
    assert.deepEqual(
      Object.keys(journal[name as keyof typeof eager]).sort(),
      Object.keys(area).sort(),
      `journal.${name}`
    );
  }
});

test('the completeness check can fail: a shortened facade names exactly the method it is missing', async () => {
  const driver = await migratedDb();
  const files = fakeFileStore();
  const eager = makeArchiveArea(driver, files);
  const shortened = deferredArea<Record<string, unknown>>(async () => eager as unknown as Record<string, unknown>)(
    Object.keys(eager).filter((name) => name !== 'importLog')
  );

  const missing = Object.keys(eager).filter((name) => !(name in shortened));
  assert.deepEqual(missing, ['importLog']);
});
