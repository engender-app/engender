/* Browser-tier check for ticket 09: the folding cases against the WASM
   SQLite, not only against Node's.

   The Node and WASM SQLites are different builds (3.51.2 and 3.48.0 as of
   this ticket), and ADR-0005's whole premise is a claim about what FTS5
   does and does not fold. So the claim is checked on both, through the real
   journal over the real driver rather than against a synthetic table: what
   matters is that fold-on-write and fold-on-query stay symmetric here too,
   and that migration v3's contentless_delete lets an edit and a delete
   actually leave the index. */
import { createWebSqlite } from '../../src/lib/data/sqlite/sqlocal-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';

const publish = (value: unknown) => {
  (window as unknown as { __searchProbeResult: unknown }).__searchProbeResult = value;
  document.body.dataset.searchProbeReady = 'true';
};

async function run() {
  // A fresh file per load: this probe is about folding, and run.mjs has no
  // reason to reload it, so it should not have to reason about leftovers.
  const name = `search-probe-${Date.now()}.sqlite3`;
  const { driver, fileOps } = createWebSqlite(name);
  const result = await boot({ createDriver: () => driver, fileOps });
  if (result.phase === 'error') {
    publish({ error: String((result.error as Error)?.stack ?? result.error) });
    return;
  }

  const journal = openJournal(result.driver);
  await journal.reconcileBuiltIns();

  const bed = await journal.entries.upsertEntry({ epochDay: 100, note: 'spałem w łóżko' });
  const gesla = await journal.entries.upsertEntry({ epochDay: 101, note: 'zażółć gęślą jaźń' });
  const cwiczenia = await journal.entries.upsertEntry({ epochDay: 102, note: 'ćwiczenia rano' });
  const tagged = await journal.entries.upsertEntry({ epochDay: 103, tags: ['e-happy'] });

  const ids = async (q: string, tagIds: string[] = []) =>
    (await journal.entries.searchEntries(q, tagIds)).map((e) => e.id);

  const folded = {
    lozko: await ids('lozko'),
    zazolc: await ids('zazolc'),
    cwiczenia: await ids('cwiczenia'),
    prefix: await ids('cwicz'),
    accentedInput: await ids('ŁÓŻKO')
  };

  const tagOnly = await ids('happy', ['e-happy']);

  // Editing has to leave nothing of the old text behind, which on a
  // contentless table is exactly what contentless_delete=1 buys.
  await journal.entries.upsertEntry({ id: bed, note: 'nowa notatka' });
  const afterEdit = { old: await ids('lozko'), new: await ids('notatka') };

  await journal.entries.deleteEntry(tagged);
  const afterDelete = await ids('happy', ['e-happy']);

  publish({
    ids: { bed, gesla, cwiczenia, tagged },
    folded,
    tagOnly,
    afterEdit,
    afterDelete,
    userVersion: await result.driver.getUserVersion()
  });
}

run().catch((err) => publish({ error: String(err?.stack ?? err) }));
