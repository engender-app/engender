import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { changeBackupPassword, checkBackupNow } from './backup-password.ts';
import { androidAutoExport, type AutoExportStatus } from './android-auto-export-bridge.ts';

vi.mock('./android-auto-export-bridge.ts', () => ({
  androidAutoExport: {
    status: vi.fn(),
    setPassword: vi.fn(),
    checkPassword: vi.fn()
  }
}));

const SAVED = 'the saved backup password';

const status = (hasPassword: boolean): AutoExportStatus => ({
  enabled: true,
  schedule: 'weekly',
  destinationUri: 'content://tree/backup',
  destinationLabel: 'backup',
  hasPassword,
  nextDueAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null
});

/* . "Back up now" used to save whatever was in the export password field as the backup
   password before every run, so a typo or an autofill re-keyed every later backup with
   nobody told. */
describe('checkBackupNow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(androidAutoExport.status).mockResolvedValue(status(true));
    vi.mocked(androidAutoExport.setPassword).mockResolvedValue();
    vi.mocked(androidAutoExport.checkPassword).mockImplementation(async ({ password }) => ({ matches: password === SAVED }));
  });

  test('a typed password that is not the saved one is refused, and the saved one stays', async () => {
    expect(await checkBackupNow('the saved backup passwrod')).toEqual({ ok: false, problem: 'mismatch' });
    expect(androidAutoExport.setPassword).not.toHaveBeenCalled();
  });

  test('an empty field backs up with the saved password', async () => {
    expect(await checkBackupNow('')).toEqual({ ok: true });
    expect(androidAutoExport.setPassword).not.toHaveBeenCalled();
  });

  test('typing the saved password again changes nothing', async () => {
    expect(await checkBackupNow(SAVED)).toEqual({ ok: true });
    expect(androidAutoExport.setPassword).not.toHaveBeenCalled();
  });

  test('with no saved password it asks for one rather than taking the field', async () => {
    vi.mocked(androidAutoExport.status).mockResolvedValue(status(false));
    expect(await checkBackupNow('a long enough new password')).toEqual({ ok: false, problem: 'no-password' });
    expect(androidAutoExport.setPassword).not.toHaveBeenCalled();
  });
});

describe('changeBackupPassword', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(androidAutoExport.setPassword).mockResolvedValue();
  });

  test('saves only when the new password is typed the same twice', async () => {
    expect(await changeBackupPassword('a new backup password', 'a new backup pasword')).toBe('mismatch');
    expect(androidAutoExport.setPassword).not.toHaveBeenCalled();
    expect(await changeBackupPassword('a new backup password', 'a new backup password')).toBe('saved');
    expect(androidAutoExport.setPassword).toHaveBeenCalledExactlyOnceWith({ password: 'a new backup password' });
  });

  test('holds the archive password floor', async () => {
    expect(await changeBackupPassword('', '')).toBe('missing');
    expect(await changeBackupPassword('short', 'short')).toBe('too-short');
    expect(androidAutoExport.setPassword).not.toHaveBeenCalled();
  });
});

/* The export screen used to call setPassword from "Back up now" and from the
   schedule switch, each with the export field's contents. Only the
   typed-twice change may write the saved password. */
test('nothing but changeBackupPassword writes the saved backup password', () => {
  const root = new URL('../../../', import.meta.url);
  const writers = ['lib/', 'routes/'].flatMap((dir) =>
    readdirSync(fileURLToPath(new URL(dir, root)), { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.(ts|svelte)$/.test(name) && !name.endsWith('.test.ts') && !name.includes('paraglide'))
      .map((name) => `${dir}${name}`)
      .filter((path) => readFileSync(fileURLToPath(new URL(path, root)), 'utf8').includes('.setPassword('))
  );
  expect(writers).toEqual(['lib/data/archive/backup-password.ts']);
});
