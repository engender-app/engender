/* Browser-tier smoke test (ticket 03's acceptance criteria). Runs inside a
   real browser, not Node, because SQLocal needs OPFS. Proves three things
   the Node tier cannot:

   1. SQLocal opens a database backed by OPFS.
   2. That database survives a full page reload (run.mjs reloads the page
      and re-runs this same probe; `markerExisted` tells it which pass it's
      on).
   3. FTS5 is compiled into the WASM build, and its diacritics folding
      matches the exact cases ADR-0005 recorded against SQLite 3.51.2 -
      including the ł case FTS5's own folding cannot cover, which is why
      search folds in application code instead (ticket 09).

   This talks to SQLocal directly, not through ticket 04's driver
   interface, which doesn't exist yet - it's a probe of the WASM SQLite
   build itself, not of the app's driver. */
import { SQLocal } from 'sqlocal';

async function run() {
  const { sql } = new SQLocal('probe.sqlite3');

  await sql`CREATE TABLE IF NOT EXISTS probe_marker (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)`;
  const existing = await sql`SELECT n FROM probe_marker WHERE id = 1`;
  const markerExisted = existing.length > 0;
  if (markerExisted) {
    await sql`UPDATE probe_marker SET n = n + 1 WHERE id = 1`;
  } else {
    await sql`INSERT INTO probe_marker (id, n) VALUES (1, 1)`;
  }

  await sql`CREATE VIRTUAL TABLE IF NOT EXISTS probe_fts USING fts5(folded_text)`;
  const ftsCount = await sql`SELECT COUNT(*) AS n FROM probe_fts`;
  if ((ftsCount[0] as { n: number }).n === 0) {
    // The exact three cases from ADR-0005, verified there against SQLite
    // 3.51.2: ą ć ę ń ó ś ź ż fold via FTS5's own `remove_diacritics 2`, but
    // ł does not, because U+0142 has no canonical decomposition.
    await sql`INSERT INTO probe_fts (folded_text) VALUES ('spałem w łóżku')`;
    await sql`INSERT INTO probe_fts (folded_text) VALUES ('zażółć gęślą jaźń')`;
  }

  const matchCount = async (query: string) => {
    const rows = await sql`SELECT rowid FROM probe_fts WHERE probe_fts MATCH ${query}`;
    return rows.length;
  };

  const fts5 = {
    lozku: await matchCount('lozku'),
    gesla: await matchCount('gesla'),
    zazolc: await matchCount('zazolc')
  };

  (window as unknown as { __probeResult: unknown }).__probeResult = { markerExisted, fts5 };
  document.body.dataset.probeReady = 'true';
}

run().catch((err) => {
  (window as unknown as { __probeResult: unknown }).__probeResult = { error: String(err?.stack ?? err) };
  document.body.dataset.probeReady = 'true';
});
