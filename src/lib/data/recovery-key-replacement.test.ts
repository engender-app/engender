/* Replacing a recovery key through process death (last-audit UI 42).

   Each test drives the real operations against one in-memory store that
   stands in for the disk, through a process that dies after a set number of
   writes or removals have landed. "Restarting" is carrying on against the
   same store with nothing else: no screen, no held key, only what was
   written. The rows are the outcome table in the approved protocol
   (orchestration/ui42-protocol-proposal-2026-10-16.md), for a replacement
   and for a journal's first key. */
import { afterEach, describe, test, expect, vi } from 'vitest';
import {
  RecoveryKeyNotPendingError,
  discardPendingRecoveryKey,
  finishRecoveryKey,
  inMemoryRecoveryKeyPorts,
  mintRecoveryKey,
  openWithRecoveryKey,
  recoveryKeyState,
  revokeRecoveryKey,
  withoutPendingRecoveryKeyOwned
} from './recovery-key.ts';
import { serializeRecoveryWrap } from '../crypto/recoveryWrap.ts';
import { RecoveryKeyMistypedError, canonicalRecoveryKey } from '../crypto/recoveryKey.ts';
import { DecryptionFailedError } from '../crypto/aesGcm.ts';
import { changeCredentials } from './credential-ownership.ts';
import { createKeystore, serializeKeystore } from '../crypto/keystore.ts';
import { changeJournalPassphrase } from './journal-passphrase.ts';
import { KEYSTORE_FILE } from './keystore-file.ts';
import { PENDING_RECOVERY_KEY_FILE, RECOVERY_KEY_FILE } from './recovery-key-file.ts';

type Ports = ReturnType<typeof inMemoryRecoveryKeyPorts>;

class ProcessDied extends Error {}

/** The same disk, seen by a process that dies once `survives` more writes or
    removals have landed: the next one never happens. */
function dyingAfter(disk: Ports, survives: number): Ports {
  let left = survives;
  const cut =
    <A extends unknown[]>(op: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      if (left <= 0) throw new ProcessDied();
      await op(...args);
      left--;
    };
  const slot = (s: Ports['active']) => ({ read: s.read, write: cut(s.write), remove: cut(s.remove) });
  return { active: slot(disk.active), pending: slot(disk.pending) };
}

const aDataKey = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(32));

async function opens(key: string, disk: Ports, dataKey: Uint8Array<ArrayBuffer>) {
  expect(await openWithRecoveryKey(key, disk)).toEqual(dataKey);
}

async function storedText(disk: Ports): Promise<string> {
  const parts = await Promise.all([disk.active.read(), disk.pending.read()]);
  return parts.map((wrap) => (wrap === null ? '' : serializeRecoveryWrap(wrap))).join('\n');
}

/** A journal with a confirmed key, as Settings leaves it. */
async function journalWithKey() {
  const disk = inMemoryRecoveryKeyPorts();
  const dataKey = aDataKey();
  const old = await mintRecoveryKey(dataKey, disk);
  await finishRecoveryKey(old, disk);
  return { disk, dataKey, old };
}

describe('replacing a key, killed at each cut', () => {
  test('before the pending wrap is written: the old key works and there is nothing to report', async () => {
    const { disk, dataKey, old } = await journalWithKey();

    await expect(mintRecoveryKey(dataKey, dyingAfter(disk, 0))).rejects.toThrow(ProcessDied);

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    await opens(old, disk, dataKey);
  });

  test('after the pending wrap is written, before anyone saw it: the old key works and the restart reports it', async () => {
    const { disk, dataKey, old } = await journalWithKey();

    // The process dies on its way back to the screen: nobody saw `unseen`.
    const unseen = await mintRecoveryKey(dataKey, dyingAfter(disk, 1));

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: true });
    await opens(old, disk, dataKey);
    // Opening with the old key promotes nothing: the new one is still waiting.
    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: true });
    await opens(unseen, disk, dataKey);
  });

  test('shown but not confirmed: the old key works until the new one is typed to finish', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const shown = await mintRecoveryKey(dataKey, disk);

    // Restart. Both keys open the journal while the replacement waits.
    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: true });
    await opens(old, disk, dataKey);

    await finishRecoveryKey(shown.toLowerCase(), disk);

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    await opens(shown, disk, dataKey);
    await expect(openWithRecoveryKey(old, disk)).rejects.toThrow(DecryptionFailedError);
  });

  test('confirmation cut before its first write: the old key still works and the new one still waits', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const shown = await mintRecoveryKey(dataKey, disk);

    await expect(finishRecoveryKey(shown, dyingAfter(disk, 0))).rejects.toThrow(ProcessDied);

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: true });
    await opens(old, disk, dataKey);
    await opens(shown, disk, dataKey);
  });

  test('between the promoting write and the pending removal: the new key is the key, and the restart only tidies', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const shown = await mintRecoveryKey(dataKey, disk);

    await expect(finishRecoveryKey(shown, dyingAfter(disk, 1))).rejects.toThrow(ProcessDied);
    expect(await disk.pending.read()).not.toBeNull();

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    expect(await disk.pending.read()).toBeNull();
    await opens(shown, disk, dataKey);
    await expect(openWithRecoveryKey(old, disk)).rejects.toThrow(DecryptionFailedError);
  });

  test('after confirmation: the old key opens nothing and nothing is reported', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const shown = await mintRecoveryKey(dataKey, disk);
    await finishRecoveryKey(shown, disk);

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    await opens(shown, disk, dataKey);
    await expect(openWithRecoveryKey(old, disk)).rejects.toThrow(DecryptionFailedError);
  });
});

test('a duplicate left while another change owns the credentials is tidied once it lets go', async () => {
  const { disk, dataKey } = await journalWithKey();
  const shown = await mintRecoveryKey(dataKey, disk);
  await expect(finishRecoveryKey(shown, dyingAfter(disk, 1))).rejects.toThrow(ProcessDied);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const owner = changeCredentials(async () => {
    entered();
    await new Promise<void>((resolve) => { release = resolve; });
  });
  await started;

  expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
  expect(await disk.pending.read()).not.toBeNull();

  release();
  await owner;
  await vi.waitFor(async () => expect(await disk.pending.read()).toBeNull());
  await opens(shown, disk, dataKey);
});

describe("a journal's first key, killed at each cut", () => {
  test('before the pending wrap is written: still no recovery key', async () => {
    const disk = inMemoryRecoveryKeyPorts();
    await expect(mintRecoveryKey(aDataKey(), dyingAfter(disk, 0))).rejects.toThrow(ProcessDied);
    expect(await recoveryKeyState(disk)).toEqual({ active: false, pending: false });
  });

  test('made but not confirmed: reported as unfinished, and the key opens the journal and finishes on the way in', async () => {
    const disk = inMemoryRecoveryKeyPorts();
    const dataKey = aDataKey();
    const unseen = await mintRecoveryKey(dataKey, disk);

    expect(await recoveryKeyState(disk)).toEqual({ active: false, pending: true });
    await opens(unseen, disk, dataKey);
    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
  });

  test('between the promoting write and the pending removal: the key is confirmed', async () => {
    const disk = inMemoryRecoveryKeyPorts();
    const dataKey = aDataKey();
    const shown = await mintRecoveryKey(dataKey, disk);

    await expect(finishRecoveryKey(shown, dyingAfter(disk, 1))).rejects.toThrow(ProcessDied);

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    await opens(shown, disk, dataKey);
  });
});

describe('the three choices after an interrupted replacement', () => {
  test('typing the new key finishes it; the old key typed there is refused and changes nothing', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const unseen = await mintRecoveryKey(dataKey, disk);

    await expect(finishRecoveryKey(old, disk)).rejects.toThrow(DecryptionFailedError);
    await expect(finishRecoveryKey(unseen.slice(0, -1), disk)).rejects.toThrow(RecoveryKeyMistypedError);
    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: true });
    await opens(old, disk, dataKey);

    await finishRecoveryKey(unseen, disk);
    await expect(openWithRecoveryKey(old, disk)).rejects.toThrow(DecryptionFailedError);
  });

  test('making another key overwrites the waiting one; the old key keeps working until the newest is confirmed', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const lost = await mintRecoveryKey(dataKey, disk);

    const next = await mintRecoveryKey(dataKey, disk);

    await expect(openWithRecoveryKey(lost, disk)).rejects.toThrow(DecryptionFailedError);
    await opens(old, disk, dataKey);
    await expect(finishRecoveryKey(lost, disk)).rejects.toThrow(DecryptionFailedError);
    await finishRecoveryKey(next, disk);
    await expect(openWithRecoveryKey(old, disk)).rejects.toThrow(DecryptionFailedError);
    await opens(next, disk, dataKey);
  });

  test('keeping the old key discards the new one', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const unseen = await mintRecoveryKey(dataKey, disk);

    await discardPendingRecoveryKey(disk);

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    await opens(old, disk, dataKey);
    await expect(openWithRecoveryKey(unseen, disk)).rejects.toThrow(DecryptionFailedError);
    await expect(finishRecoveryKey(unseen, disk)).rejects.toThrow(RecoveryKeyNotPendingError);
  });
});

describe('the gate while a replacement waits', () => {
  test('the old key opens without finishing anything; the new key opens and finishes the replacement', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const shown = await mintRecoveryKey(dataKey, disk);

    await opens(old, disk, dataKey);
    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: true });

    await opens(shown, disk, dataKey);
    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    await expect(openWithRecoveryKey(old, disk)).rejects.toThrow(DecryptionFailedError);
  });

  test('a key that is neither is refused as not this journal', async () => {
    const { disk, dataKey } = await journalWithKey();
    await mintRecoveryKey(dataKey, disk);
    const stranger = await mintRecoveryKey(aDataKey(), inMemoryRecoveryKeyPorts());

    await expect(openWithRecoveryKey(stranger, disk)).rejects.toThrow(DecryptionFailedError);
  });
});

describe('credential changes and the waiting key', () => {
  test('a change that lands takes the waiting key with it', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const unseen = await mintRecoveryKey(dataKey, disk);

    await changeCredentials(() => withoutPendingRecoveryKeyOwned(async () => {}, disk));

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    await opens(old, disk, dataKey);
    await expect(openWithRecoveryKey(unseen, disk)).rejects.toThrow(DecryptionFailedError);
  });

  test('a change that fails or is cancelled puts the waiting key back', async () => {
    const { disk, dataKey } = await journalWithKey();
    const unseen = await mintRecoveryKey(dataKey, disk);
    let seenDuring: boolean | undefined;

    await expect(changeCredentials(() => withoutPendingRecoveryKeyOwned(async () => {
      seenDuring = (await disk.pending.read()) !== null;
      throw new Error('prompt cancelled');
    }, disk))).rejects.toThrow('prompt cancelled');

    expect(seenDuring).toBe(false);
    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: true });
    await finishRecoveryKey(unseen, disk);
  });

  test('a partially committed change never restores the waiting key after cleanup fails', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const unseen = await mintRecoveryKey(dataKey, disk);

    await expect(changeCredentials(() => withoutPendingRecoveryKeyOwned(async (doNotRestorePending) => {
      doNotRestorePending();
      throw new Error('old credential cleanup failed');
    }, disk))).rejects.toThrow('old credential cleanup failed');

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    await opens(old, disk, dataKey);
    await expect(openWithRecoveryKey(unseen, disk)).rejects.toThrow(DecryptionFailedError);
  });

  test('a removal that fails stops the change before it starts', async () => {
    const { disk, dataKey } = await journalWithKey();
    await mintRecoveryKey(dataKey, disk);
    const refusing = { ...disk, pending: { ...disk.pending, remove: async () => { throw new Error('remove refused'); } } };
    let ran = false;

    await expect(withoutPendingRecoveryKeyOwned(async () => { ran = true; }, refusing)).rejects.toThrow('remove refused');
    expect(ran).toBe(false);
  });

  test('a gate open waits for a change in progress and does not use a key it discarded', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const unseen = await mintRecoveryKey(dataKey, disk);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    // Another tab's change, which discards the waiting key only as it finishes.
    const change = changeCredentials(async () => {
      entered();
      await new Promise<void>((resolve) => { release = resolve; });
      await disk.pending.remove();
    });
    await started;

    const opening = openWithRecoveryKey(unseen, disk);
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    await change;
    await expect(opening).rejects.toThrow(DecryptionFailedError);
    await opens(old, disk, dataKey);
  });
});

describe('revocation and what is stored', () => {
  test('revoking removes the waiting key as well as the confirmed one', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const shown = await mintRecoveryKey(dataKey, disk);

    await revokeRecoveryKey(disk);

    expect(await recoveryKeyState(disk)).toEqual({ active: false, pending: false });
    for (const key of [old, shown]) await expect(openWithRecoveryKey(key, disk)).rejects.toThrow();
  });

  test('a revocation cut halfway leaves the confirmed key, never only the unconfirmed one', async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const shown = await mintRecoveryKey(dataKey, disk);

    await expect(revokeRecoveryKey(dyingAfter(disk, 1))).rejects.toThrow(ProcessDied);

    expect(await recoveryKeyState(disk)).toEqual({ active: true, pending: false });
    await opens(old, disk, dataKey);
    await expect(openWithRecoveryKey(shown, disk)).rejects.toThrow(DecryptionFailedError);
  });

  test("neither slot ever holds the key's characters", async () => {
    const { disk, dataKey, old } = await journalWithKey();
    const shown = await mintRecoveryKey(dataKey, disk);

    for (const key of [old, shown]) {
      const text = await storedText(disk);
      expect(text.includes(key)).toBe(false);
      expect(text.includes(canonicalRecoveryKey(key))).toBe(false);
    }
    await finishRecoveryKey(shown, disk);
    expect((await storedText(disk)).includes(canonicalRecoveryKey(shown))).toBe(false);
  });
});

/* The file ports, over an OPFS root kept in memory: enough of the API for
   the keystore and both recovery files. */
function opfsRoot(options: { removeFails?: string } = {}) {
  const files: Record<string, string> = {};
  const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });
  const root = {
    async removeEntry(name: string) {
      if (name === options.removeFails) throw new Error('remove refused');
      if (!(name in files)) throw notFound();
      delete files[name];
    },
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!(name in files) && !opts?.create) throw notFound();
      return {
        getFile: async () => ({ text: async () => files[name] }),
        async createWritable() {
          let next = '';
          return {
            write: async (data: string) => { next = data; },
            close: async () => { files[name] = next; },
            abort: async () => {}
          };
        }
      };
    }
  };
  vi.stubGlobal('navigator', { locks: globalThis.navigator.locks, storage: { getDirectory: async () => root } });
  return files;
}

describe('a credential change while a new key waits', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('changing the passphrase discards the unconfirmed key and keeps the confirmed one', async () => {
    const files = opfsRoot();
    const { metadata, dataKey } = await createKeystore('the current passphrase');
    files[KEYSTORE_FILE] = serializeKeystore(metadata);
    const old = await mintRecoveryKey(dataKey);
    await finishRecoveryKey(old);
    const unseen = await mintRecoveryKey(dataKey);
    expect(PENDING_RECOVERY_KEY_FILE in files).toBe(true);

    await expect(changeJournalPassphrase('not the passphrase', 'a new passphrase')).rejects.toThrow(DecryptionFailedError);
    expect(PENDING_RECOVERY_KEY_FILE in files).toBe(true);

    await changeJournalPassphrase('the current passphrase', 'a new passphrase');
    expect(PENDING_RECOVERY_KEY_FILE in files).toBe(false);
    expect(RECOVERY_KEY_FILE in files).toBe(true);
    expect(await openWithRecoveryKey(old)).toEqual(dataKey);
    await expect(openWithRecoveryKey(unseen)).rejects.toThrow(DecryptionFailedError);
  });

  test('a discard that fails stops the passphrase change with nothing written', async () => {
    const files = opfsRoot({ removeFails: PENDING_RECOVERY_KEY_FILE });
    const { metadata, dataKey } = await createKeystore('the current passphrase');
    files[KEYSTORE_FILE] = serializeKeystore(metadata);
    const unseen = await mintRecoveryKey(dataKey);
    const keystore = files[KEYSTORE_FILE];

    await expect(changeJournalPassphrase('the current passphrase', 'a new passphrase')).rejects.toThrow('remove refused');
    expect(files[KEYSTORE_FILE]).toBe(keystore);
    expect(await openWithRecoveryKey(unseen)).toEqual(dataKey);
  });
});
