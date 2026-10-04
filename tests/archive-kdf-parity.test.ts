import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { ARCHIVE_ARGON2_PARAMS } from '../src/lib/crypto/params.ts';

test('native automatic backups derive the key with the archive header KDF profile', () => {
  const java = readFileSync(new URL('../android/app/src/main/java/dev/engender/app/backup/AutoExportPlugin.java', import.meta.url), 'utf8');
  const fields = {
    memorySize: 'MEMORY_SIZE',
    iterations: 'ITERATIONS',
    parallelism: 'PARALLELISM',
    hashLength: 'HASH_LENGTH'
  } as const;
  for (const [field, constant] of Object.entries(fields)) {
    const match = java.match(new RegExp(`private static final int ARCHIVE_KDF_${constant} = (\\d+);`));
    assert.ok(match, `native archive KDF constant ${constant} must be present`);
    assert.equal(Number(match[1]), ARCHIVE_ARGON2_PARAMS[field as keyof typeof fields], field);
  }
});
