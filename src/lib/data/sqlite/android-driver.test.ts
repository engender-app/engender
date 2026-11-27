/* The Android driver's half of pipelining (ADR-0089): every call crosses the bridge the
   moment it is made, numbered in call order, and the plugin's CallSequencer
   (CallSequencerTest.java) runs them in that order. The bridge here is a fake that answers
   nothing until told to, so a call that waited for the one before it would never be sent at
   all. */

import { beforeEach, expect, test, vi } from 'vitest';

type Sent = { method: string; options: Record<string, unknown>; answer: (value?: unknown) => void; fail: (error: Error) => void };
const sent: Sent[] = [];

vi.mock('@capacitor/core', () => ({
  registerPlugin: () =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => (options: Record<string, unknown> = {}) =>
          new Promise((resolve, reject) => {
            sent.push({ method, options, answer: resolve, fail: reject });
          })
      }
    )
}));

const { createAndroidSqlite } = await import('./android-driver.ts');

beforeEach(() => {
  sent.length = 0;
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('ordinary calls pipeline, then outside calls wait through transaction commit', async () => {
  const { driver } = createAndroidSqlite('journal');

  const first = driver.query('SELECT a');
  const second = driver.run('INSERT b');
  const transaction = driver.transaction(async (driver) => {
    await driver.run('INSERT inside');
  });
  const outside = driver.query('SELECT c');
  await flush();

  // Ordinary calls cross immediately; BEGIN waits for both to finish.
  expect(sent.map((call) => [call.method, call.options.sql ?? null])).toEqual([
    ['open', null],
    ['query', 'SELECT a'],
    ['run', 'INSERT b']
  ]);

  sent[0].answer();
  sent[1].answer({ rows: [] });
  sent[2].answer({ changes: 1, lastInsertRowid: 1 });
  await Promise.all([first, second]);
  await flush();
  expect(sent.at(-1)!.method).toBe('beginTransaction');

  // The transaction's own statement goes once its BEGIN has answered.
  sent.at(-1)!.answer();
  await flush();
  expect(sent.at(-1)!.options.sql).toBe('INSERT inside');
  sent.at(-1)!.answer({ changes: 1, lastInsertRowid: 1 });
  await flush();
  expect(sent.at(-1)!.method).toBe('commitTransaction');
  sent.at(-1)!.answer();
  await transaction;
  await flush();
  expect(sent.at(-1)!.options.sql).toBe('SELECT c');
  sent.at(-1)!.answer({ rows: [] });
  await outside;

  const session = sent[0].options.session;
  expect(typeof session).toBe('string');
  expect(sent.map((call) => call.options.session)).toEqual(sent.map(() => session));
  expect(sent.map((call) => call.options.seq)).toEqual(sent.map((_, index) => index));
});

test('a driver made after another counts from its own open, in a session of its own', async () => {
  createAndroidSqlite('journal');
  const { driver } = createAndroidSqlite('journal');
  void driver.query('SELECT 1');
  await flush();

  const [firstOpen, secondOpen, query] = sent;
  expect(firstOpen.options.seq).toBe(0);
  expect(secondOpen.options.seq).toBe(0);
  expect(query.options.seq).toBe(1);
  expect(secondOpen.options.session).not.toBe(firstOpen.options.session);
  expect(query.options.session).toBe(secondOpen.options.session);
});

test("a statement sent behind a failed open reports the open's failure, not its own", async () => {
  const { driver } = createAndroidSqlite('journal', new Uint8Array(32));
  const read = driver.query('SELECT 1');
  await flush();

  /* The plugin runs the query anyway, after the open, and it fails there as
     "not open" - the symptom. The cause is the open's. */
  sent[1].fail(new Error('the database is not open'));
  sent[0].fail(new Error('file is not a database'));

  await expect(read).rejects.toThrow('file is not a database');
});

test('a statement that fails on its own reports its own error', async () => {
  const { driver } = createAndroidSqlite('journal');
  const read = driver.query('SELECT nope');
  await flush();
  sent[0].answer();
  sent[1].fail(new Error('no such column: nope'));

  await expect(read).rejects.toThrow('no such column: nope');
});

test('the two calls made with no driver open carry no number', async () => {
  const { deleteAndroidDatabase, inspectAndroidJournal } = await import('./android-driver.ts');
  void deleteAndroidDatabase('journal');
  void inspectAndroidJournal('journal');
  await flush();

  expect(sent.map((call) => [call.method, call.options.seq])).toEqual([
    ['deleteDatabase', undefined],
    ['isPlaintextDatabase', undefined]
  ]);
});

/* The start-over wipe runs from a locked gate, in a process where nothing has opened the
   journal, so the plugin has no open of its own to learn the file from. It has to be told. */
test('the start-over wipe names the database it deletes', async () => {
  const { deleteAndroidDatabase } = await import('./android-driver.ts');
  void deleteAndroidDatabase('engender.sqlite3');
  await flush();

  expect(sent.find((call) => call.method === 'deleteDatabase')?.options).toEqual({ name: 'engender.sqlite3' });
});

/* ui 33: the failure screen's file operations come after boot() closed the
   driver, and the plugin refuses a closed session. They go on a second
   session, sent only once the close has answered, since the plugin orders
   calls within a session and not across two. */
test('a file operation made after the close waits for it, then goes on a session of its own', async () => {
  const { driver, fileOps } = createAndroidSqlite('journal');
  const closed = driver.close();
  const check = fileOps.preMigrationCopyIsUsable();
  await flush();
  expect(sent.map((call) => call.method)).toEqual(['open', 'close']);

  sent[0].answer();
  sent[1].answer();
  await closed;
  await flush();
  const asked = sent[2];
  expect(asked.method).toBe('preMigrationCopyIsUsable');
  expect(asked.options.session).not.toBe(sent[0].options.session);
  expect(asked.options.seq).toBe(0);

  asked.answer({ usable: true });
  await expect(check).resolves.toBe(true);

  void fileOps.restorePreMigrationCopy();
  await flush();
  expect(sent[3].options).toMatchObject({ session: asked.options.session, seq: 1 });
});

test('storage survey reports retained ciphertext without opening a connection', async () => {
  const { inspectAndroidJournal } = await import('./android-driver');
  const result = inspectAndroidJournal('journal');
  expect(sent.map(call => call.method)).toEqual(['isPlaintextDatabase']);
  sent[0].answer({ exists: true, plaintext: false });
  await expect(result).resolves.toEqual({ exists: true, plaintext: false });
});
