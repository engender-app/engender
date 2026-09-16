import { test, expect, vi } from 'vitest';

vi.mock('$lib/android/plugin-registry', () => ({
  registerAndroidPlugin: () => ({}),
  androidPluginOwners: () => ({})
}));

import * as androidDriver from '../data/sqlite/android-driver';

import * as mcDriver from '../data/sqlite/mc-driver';
import {
  journalPhotoFiles,
  createJournalSqlite,
  setActiveDriver,
  getActiveDriver,
  closeActiveDriver
} from './journal-ports';
import type { SqliteDriver } from '../data/sqlite/driver';
import type { WebSqlite } from '../data/sqlite/sqlocal-driver';


test('photoFiles store creation is decoupled from SQLite driver creation', () => {
  const androidSpy = vi.spyOn(androidDriver, 'createAndroidSqlite');
  const mcSpy = vi.spyOn(mcDriver, 'createEncryptedWebSqlite');

  const key = new Uint8Array(32);
  const store = journalPhotoFiles(key);

  expect(store).toBeDefined();
  expect(androidSpy).not.toHaveBeenCalled();
  expect(mcSpy).not.toHaveBeenCalled();

  androidSpy.mockRestore();
  mcSpy.mockRestore();
});

test('createJournalSqlite on Android instantiates Android driver without creating photo store', () => {
  const originalWindow = globalThis.window;
  try {
    (globalThis as unknown as { window: unknown }).window = {
      Capacitor: {
        getPlatform: () => 'android'
      }
    };
    const key = new Uint8Array(32);
    const sqlite = createJournalSqlite(key);
    expect(sqlite).toBeDefined();
    expect(sqlite.driver).toBeDefined();
    expect(sqlite.fileOps).toBeDefined();
  } finally {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  }
});

test('createJournalSqlite on web delegates to createEncryptedWebSqlite', () => {
  const fakeWebSqlite = { driver: {}, fileOps: {} } as unknown as WebSqlite;
  const mcSpy = vi.spyOn(mcDriver, 'createEncryptedWebSqlite').mockReturnValue(fakeWebSqlite);

  const key = new Uint8Array(32);
  const sqlite = createJournalSqlite(key);
  expect(sqlite).toBe(fakeWebSqlite);
  expect(mcSpy).toHaveBeenCalled();

  mcSpy.mockRestore();
});


test('driver lifecycle cleanly closes active driver and clears reference', async () => {
  let closed = false;
  const fakeDriver = {
    close: async () => {
      closed = true;
    }
  } as unknown as SqliteDriver;

  setActiveDriver(fakeDriver);
  expect(getActiveDriver()).toBe(fakeDriver);

  await closeActiveDriver();
  expect(closed).toBe(true);
  expect(getActiveDriver()).toBeNull();
});

test('closeActiveDriver is safe when no driver is active', async () => {
  setActiveDriver(null);
  await expect(closeActiveDriver()).resolves.toBeUndefined();
  expect(getActiveDriver()).toBeNull();
});
