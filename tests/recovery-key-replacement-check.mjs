/* Replacing a recovery key through an interruption (last-audit UI 42).

   A reload stands in for process death on the web: it drops the page, its
   memory and the screen showing the key, and keeps only what was written.
   The demo journal reopens itself with its fixed passphrase, so a reload
   lands on Home the way a restart and an ordinary unlock would.

   Cuts that fall inside a file operation are made by holding that operation
   forever and reloading: after the pending file is written but before the
   key reaches the screen, and between the promoting write and the pending
   file's removal. Which key opens the journal afterwards is asked of the
   real recovery-key module in the page, so nothing here reads a wrap. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const PENDING = 'recovery-key-pending.json';
const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const base = server.resolvedUrls.local[0];

async function navigate(path) {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}

async function booted() {
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
  }
  await page.waitForSelector('[data-home-hello]');
}

/** The process dies: the page goes, and the app comes back from storage. */
async function restart() {
  await page.goto(base, { waitUntil: 'networkidle' });
  await booted();
}

async function files() {
  return page.evaluate(async () => {
    const names = [];
    for await (const name of (await navigator.storage.getDirectory()).keys()) names.push(name);
    return names.filter((name) => name.startsWith('recovery-key'));
  });
}

/** Whether `key` opens the journal right now, asked without promoting
    anything: the gate's own read order, on copies of the two files. */
async function opens(key) {
  return page.evaluate(async (typed) => {
    const { canonicalRecoveryKey } = await import('/src/lib/crypto/recoveryKey.ts');
    const { unwrapDataKeyWithRecoveryKey } = await import('/src/lib/crypto/recoveryWrap.ts');
    const { readRecoveryWrapFile } = await import('/src/lib/data/recovery-key-file.ts');
    // A file replaced while it is being read reads as NotReadableError; read again.
    const read = async (name) => {
      for (let attempt = 0; ; attempt++) {
        try { return await readRecoveryWrapFile(name); } catch (error) {
          if (error?.name !== 'NotReadableError' || attempt > 5) throw error;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    };
    for (const name of ['recovery-key.json', 'recovery-key-pending.json']) {
      const wrap = await read(name);
      if (wrap === null) continue;
      try {
        await unwrapDataKeyWithRecoveryKey(wrap, canonicalRecoveryKey(typed));
        return true;
      } catch {}
    }
    return false;
  }, key);
}

async function openRecoveryScreen() {
  await navigate('/settings/recovery-key');
  await page.waitForSelector('[data-recovery-key-step]');
}

async function mintFromScreen(selector) {
  await page.locator(selector).click();
  if (selector === '[data-list-row="replace-recovery-key"]') await page.locator('[data-confirm-replace]').click();
  await page.locator('[data-recovery-key]').waitFor();
  return (await page.locator('[data-recovery-key]').innerText()).trim();
}

async function confirmShown() {
  await page.locator('[data-recovery-key-done]').click();
  await page.locator('[data-recovery-key-step="active"]').waitFor();
}

async function expectNotice(kind) {
  const notice = page.locator('[data-recovery-key-notice]');
  await notice.waitFor();
  assert.match(await notice.innerText(), kind === 'replace' ? /Replacing your recovery key did not finish/ : /Making your recovery key did not finish/);
  assert.match(await notice.innerText(), kind === 'replace' ? /old key still opens this journal/ : /cannot be shown again/);
}

async function noNotice() {
  // Home's fold has answered once its reserve body is drawn.
  await page.locator('[data-home-reserve="below"] [data-read-reserve-body]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-recovery-key-notice]').count(), 0, 'Home reports nothing');
}

/** Holds the next write of `name` forever once it has landed, or the next
    removal of `name` forever before it happens. */
async function holdAfterWrite(name) {
  await page.evaluate((file) => {
    const original = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      const writable = await original.apply(this, args);
      if (this.name === file) {
        const close = writable.close.bind(writable);
        writable.close = async () => {
          await close();
          window.rkHeld = 'after-write';
          await new Promise(() => {});
        };
      }
      return writable;
    };
  }, name);
}

async function holdBeforeRemove(name) {
  await page.evaluate((file) => {
    const original = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = async function (entry, ...rest) {
      if (entry === file) {
        window.rkHeld = 'before-remove';
        await new Promise(() => {});
      }
      return original.call(this, entry, ...rest);
    };
  }, name);
}

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await booted();

  // A journal's first key, interrupted after it was shown.
  await openRecoveryScreen();
  let first = await mintFromScreen('[data-make-recovery-key]');
  await restart();
  await expectNotice('make');
  assert.equal(await opens(first), true, 'the unconfirmed first key opens the journal');
  await page.locator('[data-recovery-key-notice] a[href="/settings/recovery-key"]').click();
  await page.locator('[data-recovery-key-step="unfinished"]').waitFor();
  assert.match(await page.locator('[data-list-row="discard-pending-recovery-key"]').innerText(), /Discard the new key/);
  await page.locator('[data-list-row="finish-recovery-key"]').click();
  await page.locator('#rk-finish-key').fill(first.toLowerCase());
  await page.locator('[data-submit-finish-recovery-key]').click();
  await page.locator('[data-recovery-key-step="active"]').waitFor();
  assert.deepEqual(await files(), ['recovery-key.json']);
  console.log('PASS an interrupted first key is reported, and typing it finishes it');

  const old = first;

  // Cut 1: before the pending wrap is written.
  await page.locator('[data-list-row="replace-recovery-key"]').click();
  await page.locator('[data-confirm-replace]').waitFor();
  await restart();
  await noNotice();
  assert.equal(await opens(old), true);
  assert.deepEqual(await files(), ['recovery-key.json']);
  console.log('PASS cut before the pending wrap: the old key works and nothing is reported');

  // Cut 2: the pending wrap is written, the key never reaches the screen.
  await openRecoveryScreen();
  await holdAfterWrite(PENDING);
  await page.locator('[data-list-row="replace-recovery-key"]').click();
  await page.locator('[data-confirm-replace]').click();
  await page.waitForFunction(() => window.rkHeld === 'after-write');
  assert.equal(await page.locator('[data-recovery-key]').count(), 0, 'the key was never shown');
  await restart();
  await expectNotice('replace');
  assert.equal(await opens(old), true, 'the old key still works');
  assert.deepEqual((await files()).sort(), ['recovery-key-pending.json', 'recovery-key.json']);
  await openRecoveryScreen();
  await page.locator('[data-recovery-key-step="unfinished"]').waitFor();
  assert.match(await page.locator('[data-list-row="discard-pending-recovery-key"]').innerText(), /Keep the old key/);
  await page.locator('[data-list-row="discard-pending-recovery-key"]').click();
  await page.locator('[data-recovery-key-step="active"]').waitFor();
  assert.deepEqual(await files(), ['recovery-key.json']);
  assert.equal(await opens(old), true);
  console.log('PASS cut after the pending wrap: old key works, the notice says so, Keep the old key discards the new one');

  // Cut 3: shown, not confirmed; "Make a new key", then the old key typed to finish is refused.
  await page.locator('[data-list-row="replace-recovery-key"]').click();
  await page.locator('[data-confirm-replace]').click();
  const lost = (await page.locator('[data-recovery-key]').innerText()).trim();
  await restart();
  await expectNotice('replace');
  assert.equal(await opens(old), true);
  assert.equal(await opens(lost), true, 'both keys open while the replacement waits');
  await openRecoveryScreen();
  await page.locator('[data-list-row="finish-recovery-key"]').click();
  await page.locator('#rk-finish-key').fill(old);
  await page.locator('[data-submit-finish-recovery-key]').click();
  await page.waitForFunction(() => /That is not the new key/.test(document.querySelector('[data-recovery-key-finish-error]')?.textContent ?? ''));
  await page.locator('[data-cancel-finish-recovery-key]').click();
  const next = await mintFromScreen('[data-list-row="make-another-recovery-key"]');
  assert.equal(await opens(lost), false, 'making a new key ends the lost one');
  assert.equal(await opens(old), true, 'the old key works until the newest is confirmed');
  await confirmShown();
  assert.equal(await opens(old), false);
  assert.equal(await opens(next), true);
  assert.deepEqual(await files(), ['recovery-key.json']);
  console.log('PASS cut after showing: both keys work, the old key cannot finish it, Make a new key ends the lost one');

  // Cut 4: between the promoting write and the pending file's removal.
  await page.locator('[data-list-row="replace-recovery-key"]').click();
  await page.locator('[data-confirm-replace]').click();
  const promoted = (await page.locator('[data-recovery-key]').innerText()).trim();
  await holdBeforeRemove(PENDING);
  await page.locator('[data-recovery-key-done]').click();
  await page.waitForFunction(() => window.rkHeld === 'before-remove');
  await restart();
  await noNotice();
  // Tidied by the first read, or as soon as the boot lets go of the credentials.
  await page.waitForFunction(async () => {
    for await (const name of (await navigator.storage.getDirectory()).keys()) if (name === 'recovery-key-pending.json') return false;
    return true;
  }, null, { timeout: 10000 });
  assert.equal(await opens(promoted), true);
  assert.equal(await opens(next), false);
  console.log('PASS cut inside the confirmation: the new key is the key and the restart only tidies');

  // Cut 5: after confirmation.
  await openRecoveryScreen();
  const confirmed = await mintFromScreen('[data-list-row="replace-recovery-key"]');
  await confirmShown();
  await restart();
  await noNotice();
  assert.equal(await opens(confirmed), true);
  assert.equal(await opens(promoted), false);
  console.log('PASS cut after confirmation: the new key alone, nothing reported');

  // No key characters anywhere a restart could read them.
  const stored = await page.evaluate(async () => {
    const texts = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    for await (const [name, handle] of (await navigator.storage.getDirectory()).entries()) {
      if (handle.kind === 'file' && name.endsWith('.json')) texts.push(await (await handle.getFile()).text());
    }
    return texts.join('\n');
  });
  for (const key of [old, lost, next, promoted, confirmed]) {
    assert.equal(stored.includes(key), false);
    assert.equal(stored.includes(key.replace(/-/g, '')), false);
  }
  console.log('PASS no recovery key characters in web storage or the OPFS credential files');

  // A changed access protection discards a waiting key and keeps the confirmed one.
  await openRecoveryScreen();
  await mintFromScreen('[data-list-row="replace-recovery-key"]');
  await restart();
  await expectNotice('replace');
  await page.evaluate(async () => {
    const { changeAccessMode } = await import('/src/lib/stores/boot.svelte.ts');
    await changeAccessMode('passphrase', 'demo');
  });
  assert.deepEqual(await files(), ['recovery-key.json']);
  assert.equal(await opens(confirmed), true);
  console.log('PASS an access-mode change discards the waiting key and keeps the confirmed one');

  // The gate: a waiting key typed at the recovery entry opens the journal and finishes the replacement.
  await openRecoveryScreen();
  const atGate = await mintFromScreen('[data-list-row="replace-recovery-key"]');
  await page.evaluate(async () => {
    const { writeKeystoreFile, readKeystoreFile } = await import('/src/lib/data/keystore-file.ts');
    const { rewrapKeystore } = await import('/src/lib/crypto/keystore.ts');
    await writeKeystoreFile(await rewrapKeystore(await readKeystoreFile(), 'demo', 'not the demo passphrase'));
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-use-recovery-key]').click();
  await page.locator('[data-recovery-key-input]').fill(atGate);
  await page.locator('[data-submit-recovery-key]').click();
  await page.waitForFunction(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return bootState.journal !== null;
  });
  await page.waitForFunction(async () => {
    for await (const name of (await navigator.storage.getDirectory()).keys()) if (name === 'recovery-key-pending.json') return false;
    return true;
  });
  assert.equal(await opens(atGate), true);
  assert.equal(await opens(confirmed), false);
  console.log('PASS the waiting key opens the journal at the gate and becomes the key');
} finally {
  await browser.close();
  await server.close();
}
