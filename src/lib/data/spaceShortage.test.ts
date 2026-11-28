import { describe, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { spaceShortage } from './spaceShortage';
import { oneTransactionAtATime } from './sqlite/transactor';

describe('spaceShortage', () => {
  test('names the device for every out-of-space text the drivers and the shell hand over', () => {
    // SQLite on either driver, the Android photo write, and java.nio's copy.
    expect(spaceShortage(new Error('database or disk is full'))).toBe('device');
    expect(spaceShortage(new Error('database or disk is full (code 13 SQLITE_FULL)'))).toBe('device');
    expect(
      spaceShortage(new Error('/data/user/0/dev.engender.app/files/photos/a.jpg: write failed: ENOSPC (No space left on device)'))
    ).toBe('device');
    expect(spaceShortage(new Error('/data/user/0/dev.engender.app/databases/journal.db: No space left on device'))).toBe(
      'device'
    );
    // The boot machine's bridge failures arrive as text only.
    expect(spaceShortage('database or disk is full')).toBe('device');
  });

  test('names the device for a browser quota refusal', () => {
    expect(spaceShortage(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))).toBe('device');
  });

  test('reads the native codes the export bridge rejects with', () => {
    expect(spaceShortage(Object.assign(new Error('export-transfer-failed'), { code: 'storage-full' }))).toBe('device');
    expect(spaceShortage(Object.assign(new Error('export-delivery-failed'), { code: 'destination-full' }))).toBe(
      'destination'
    );
  });

  test('finds the original failure behind a refused rollback', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE entry (body TEXT); PRAGMA max_page_count = 20');
    const transaction = oneTransactionAtATime({
      begin: async () => db.exec('BEGIN'),
      commit: async () => db.exec('COMMIT'),
      rollback: async () => db.exec('ROLLBACK')
    });
    const failure = await transaction(() => {
      const insert = db.prepare('INSERT INTO entry VALUES (?)');
      for (let i = 0; i < 1000; i++) insert.run('x'.repeat(2000));
    }).catch((error: unknown) => error);
    db.close();

    expect(failure).toBeInstanceOf(AggregateError);
    expect(spaceShortage(failure)).toBe('device');
  });

  test('looks through a wrapped cause', () => {
    expect(spaceShortage(new Error('could not save', { cause: new Error('database or disk is full') }))).toBe('device');
  });

  test('leaves every other failure unnamed, including other export refusals', () => {
    expect(spaceShortage(new Error('export-delivery-failed'))).toBeNull();
    expect(spaceShortage(Object.assign(new Error('export-transfer-failed'), { code: 'destination-revoked' }))).toBeNull();
    expect(spaceShortage(new Error('database is locked'))).toBeNull();
    expect(spaceShortage(new Error('disk I/O error'))).toBeNull();
    expect(spaceShortage(new DOMException('Permission denied', 'NotAllowedError'))).toBeNull();
    expect(spaceShortage(undefined)).toBeNull();
    expect(spaceShortage(null)).toBeNull();
  });

  test('a cause that refers back to itself does not loop', () => {
    const looping = new Error('outer') as Error & { cause?: unknown };
    looping.cause = looping;
    expect(spaceShortage(looping)).toBeNull();
  });
});
