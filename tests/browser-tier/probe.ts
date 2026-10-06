/* OPFS persistence and FTS5 against the production encrypted driver. */
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { PROBE_DATA_KEY } from './fresh-origin.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'probe';

async function run() {
  const { driver } = createEncryptedWebSqlite('probe.sqlite3', PROBE_DATA_KEY);
  const sql = async (strings: TemplateStringsArray, ...params: unknown[]) => driver.query(strings.join('?'), params);

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

  await driver.close();
  publish(NAME, { markerExisted, fts5 });
}

run().catch((err) => publish(NAME, { error: String(err?.stack ?? err) }));
