import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { newCapabilityContext, launchBrowser, browserEngine } from '../browser-harness.mjs';
import { serveBuild } from '../serve-build.mjs';
import { tinyPhoto } from '../photo-fixture.mjs';
import { mediaFixtures } from '../media-fixtures.mjs';
import { makePdf } from '../pdf-fixture.mjs';
import { firstRun, reachAccessSetup, choosePassphrase, unlock, clientRoute, openSection, pickFile, trackTransitions } from './built-flow.mjs';

const engine = browserEngine();
const server = await serveBuild(process.cwd());
const origin = `http://localhost:${server.httpServer.address().port}`;
const browser = await launchBrowser(engine === 'chromium' ? {
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
} : engine === 'firefox' ? { firefoxUserPrefs: { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true } } : {});
const results = [];
const errors = [];
async function testContext(options = {}) {
  const context = await newCapabilityContext(browser, options);
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await trackTransitions(context);
  return context;
}
async function check(capability, operation) {
  const start = Date.now();
  if (!browser.isConnected()) {
    results.push({ capability, status: 'not-run', evidence: 'Runtime disconnected before case.' });
    if (process.env.CAPABILITY_RESULTS) await writeFile(process.env.CAPABILITY_RESULTS, JSON.stringify(results, null, 2) + '\n');
    return;
  }
  try {
    const evidence = await operation();
    results.push({ capability, status: 'pass', evidence, durationMs: Date.now() - start });
    console.log('PASS', capability, JSON.stringify(evidence));
  } catch (error) {
    results.push({ capability, status: 'fail', evidence: error.stack, durationMs: Date.now() - start });
    console.error('FAIL', capability, error.stack);
    if (!page.isClosed()) {
      console.error('FAILURE DOCUMENT', page.url(), (await page.locator('body').innerText()).slice(0, 3000));
      if (await page.locator('#ed-note').count()) {
        await clientRoute(page, '/calendar', true).catch(() => {});
      }
    }
  }
  if (process.env.CAPABILITY_RESULTS) await writeFile(process.env.CAPABILITY_RESULTS, JSON.stringify(results, null, 2) + '\n');
}
const context = await testContext({ acceptDownloads: true, viewport: { width: 390, height: 900 } });
let page = await context.newPage();
page.setDefaultTimeout(15000);
const note = `Capability journal ${engine}`;
let entryPath;
async function saveNote(text) {
  await clientRoute(page, '/entry/new/2026-10-05?seedMood=4');
  await page.locator('#ed-note').fill(text);
  await page.locator('[data-save]').click();
  await page.waitForFunction(() => !location.pathname.startsWith('/entry/new/'));
  await clientRoute(page, '/day/2026-10-05');
  await page.getByText(text, { exact: true }).first().waitFor();
}
async function readNote() {
  await clientRoute(page, '/day/2026-10-05');
  await page.getByText(note, { exact: true }).first().waitFor();
}
try {
  if (engine === 'webkit') {
    const privateContext = await browser.newContext();
    const privatePage = await privateContext.newPage();
    try {
      await privatePage.goto(origin);
      const storage = await privatePage.evaluate(async () => {
        try { await navigator.storage.getDirectory(); return { available: true }; }
        catch (error) { return { available: false, error: `${error.name}: ${error.message}` }; }
      });
      if (storage.available) throw new Error('Private OPFS became available; extend private journal verification before claiming support.');
      await privatePage.locator('[data-boot-failure]').waitFor({ timeout: 30000 });
      assert.equal(await privatePage.locator('[data-app-root][data-boot="ready"]').count(), 0);
      results.push({ capability: 'private-context-opfs', status: 'unsupported', evidence: { ...storage, handledBootFailure: true, normalFlows: 'independent persistent profiles' } });
    } catch (error) {
      results.push({ capability: 'private-context-opfs', status: 'fail', evidence: error.stack });
    } finally { await privateContext.close(); }
    if (process.env.CAPABILITY_RESULTS) await writeFile(process.env.CAPABILITY_RESULTS, JSON.stringify(results, null, 2) + '\n');
  }
  await check('production-headers', async () => {
    const response = await fetch(origin);
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
    assert.equal(await response.text(), await readFile('build/index.html', 'utf8'));
    return { document: 'build/index.html', isolation: true };
  });
  await check('persistence-denial', async () => {
    await page.addInitScript(() => { navigator.storage.persist = async () => false; });
    await firstRun(page, origin);
    await page.locator('[data-storage-notice]').waitFor();
    await saveNote(note);
    entryPath = await page.getByText(note, { exact: true }).first().locator('xpath=ancestor::a').getAttribute('href');
    return { startup: 'ready', warning: true, savedNote: note };
  });
  await check('encrypted-reopen', async () => {
    await page.reload();
    await unlock(page);
    await readNote();
    assert.equal(await page.evaluate(() => !!navigator.storage.getDirectory), true);
    return { savedNote: note, reopened: true };
  });
  await check('browser-back', async () => {
    await clientRoute(page, '/calendar');
    await clientRoute(page, '/settings');
    await page.goBack();
    await page.locator('[data-nav-item="calendar"][aria-current="page"]').waitFor();
    await readNote();
    return { note, navigation: 'client history Back' };
  });
  await check('multi-tab-ownership', async () => {
    const second = await context.newPage();
    try {
      await second.goto(origin);
      await second.locator('#journal-passphrase').fill('verify-build passphrase');
      await second.locator('[data-passphrase-submit]').click();
      await second.locator('[data-boot-failure]').waitFor({ timeout: 30000 });
      assert.equal(await second.locator('[data-app-root][data-boot="ready"]').count(), 0);
      await readNote();
      await page.close();
      await second.reload();
      await unlock(second);
      await clientRoute(second, '/day/2026-10-05');
      await second.getByText(note, { exact: true }).first().waitFor();
      return { contention: 'handled boot failure', ownerContentPreserved: true, reopenedAfterRelease: true };
    } finally {
      await second.close();
    }
  });
  if (page.isClosed()) {
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(origin);
    await unlock(page);
  }
  await check('biometric-advertisement', async () => {
    const capability = await page.evaluate(async () => {
      const pkc = globalThis.PublicKeyCredential;
      if (!pkc?.getClientCapabilities || !pkc?.isUserVerifyingPlatformAuthenticatorAvailable) return { prf: false, platform: false };
      try {
        return { prf: (await pkc.getClientCapabilities())['extension:prf'] === true,
          platform: await pkc.isUserVerifyingPlatformAuthenticatorAvailable() };
      } catch (error) { return { prf: false, platform: false, error: String(error) }; }
    });
    await clientRoute(page, '/settings/access-mode');
    await page.locator('[data-access-modes]').waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-access-modes] [data-list-row="biometric"]').count(), capability.prf && capability.platform ? 1 : 0);
    assert.equal(await page.locator('[data-access-modes] [data-list-row="device-bound"]').count(), 1);
    assert.equal(await page.locator('[data-access-modes] [data-list-row="pin"]').count(), 1);
    return { ...capability, controlsMatch: true };
  });
  if (engine === 'chromium') await check('biometric-negotiation-refusal', async () => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
      hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
      automaticPresenceSimulation: true, hasPrf: false
    } });
    await clientRoute(page, '/settings');
    await clientRoute(page, '/settings/access-mode');
    await page.locator('[data-list-row="biometric"]').waitFor();
    await page.locator('[data-list-row="biometric"]').click();
    await page.locator('[data-access-submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-access-status]')?.textContent.trim().length > 0);
    assert.ok(await page.locator('[data-access-submit]').isEnabled());
    await page.reload();
    await unlock(page);
    await readNote();
    await cdp.detach();
    return { fixture: 'Chromium virtual authenticator without PRF', oldPassphraseStillUnlocks: true, contentPreserved: true };
  });
  else results.push({ capability: 'biometric-negotiation-refusal', status: 'not-run', evidence: 'No engine authenticator automation. Actual advertisement tested separately.' });
  await check('quota-failure-preserves-data', async () => {
    await clientRoute(page, '/entry/new/2026-10-05?seedMood=4');
    await page.locator('#ed-note').fill('Failed quota write');
    await page.evaluate(() => {
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(message, ...args) {
        if (message.op === 'run' && /INSERT INTO entry\b/.test(message.args.sql)) {
          Worker.prototype.postMessage = post;
          window.quotaInjected = true;
          queueMicrotask(() => this.onmessage({ data: { id: message.id, ok: false, error: 'QuotaExceededError: injected full storage' } }));
          return;
        }
        return post.call(this, message, ...args);
      };
    });
    await page.locator('[data-save]').click();
    await page.getByText('Couldn’t save this entry.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.quotaInjected), true);
    assert.equal(await page.locator('#ed-note').inputValue(), 'Failed quota write');
    await clientRoute(page, '/day/2026-10-05', true);
    await page.reload();
    await unlock(page);
    await readNote();
    assert.equal(await page.getByText('Failed quota write', { exact: true }).count(), 0);
    return { fault: 'injected worker quota failure', originalNote: note, failedWriteAbsent: true };
  });
  await check('photo-import-playback', async () => {
    await clientRoute(page, entryPath);
    await openSection(page, 'photos');
    await pickFile(page, '[data-add-photo]', { name: 'capability.png', mimeType: 'image/png', buffer: await tinyPhoto(page, '#c94f7c') });
    await page.locator('[data-photo-day-skip]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-editor-section="photos"] img')].some(image => image.complete && image.naturalWidth > 0));
    await page.locator('[data-save]').click();
    await page.waitForFunction(() => !document.querySelector('#ed-note'));
    return { decoded: true, saved: true };
  });
  const media = await mediaFixtures();
  for (const [capability, section, trigger, file, mime, row] of [
    ['audio-import-playback', 'voice', '[data-add-recording-file]', media.voice, 'audio/webm', '.recording-row'],
    ['video-import-playback', 'video', '[data-add-video-file]', media.landscape, 'video/webm', '.video-row']
  ]) await check(capability, async () => {
    await clientRoute(page, entryPath);
    await openSection(page, section);
    await pickFile(page, trigger, { name: file.split('/').pop(), mimeType: mime, buffer: await readFile(file) });
    await page.locator(`${row} [data-transport-toggle]`).last().waitFor({ timeout: 30000 });
    await page.locator(`${row} [data-transport-toggle]`).last().click();
    await page.waitForFunction(row => [...document.querySelectorAll(`${row} audio, ${row} video`)].some(media => media.currentTime > 0.2 && !media.paused && media.readyState >= 2), row);
    await page.locator('[data-save]').click();
    await page.waitForFunction(() => !document.querySelector('#ed-note'));
    return { fixture: file.split('/').pop(), playbackAdvances: true, saved: true };
  });
  for (const [capability, section, row] of [
    ['audio-capture-playback', 'voice', '.recording-row'],
    ['video-capture-playback', 'video', '.video-row']
  ]) {
    if (engine === 'webkit') {
      results.push({ capability, status: 'not-run', evidence: 'Automated WebKit has no camera/microphone fixture on this host.' });
      console.log('NOT-RUN', capability, 'no camera/microphone fixture');
      continue;
    }
    await check(capability, async () => {
      await clientRoute(page, '/entry/new/2026-10-06?seedMood=4');
      await page.locator('#ed-note').fill(capability);
      await openSection(page, section);
      const panel = page.locator(`[data-editor-section="${section}"]`);
      await panel.getByRole('button', { name: 'Record', exact: true }).click();
      await panel.getByRole('button', { name: 'Stop', exact: true }).waitFor();
      await page.waitForTimeout(1200);
      await panel.getByRole('button', { name: 'Stop', exact: true }).click();
      await panel.locator(`${row} [data-transport-toggle]`).waitFor({ timeout: 30000 });
      await panel.locator(`${row} [data-transport-toggle]`).click();
      await page.waitForFunction(row => [...document.querySelectorAll(`${row} audio, ${row} video`)].some(media => media.currentTime > 0.2 && (!media.paused || media.ended) && media.readyState >= 2), row);
      await page.locator('[data-save]').click();
      await page.waitForFunction(() => !document.querySelector('#ed-note'));
      return { source: 'browser synthetic device', playbackAdvances: true, saved: true };
    });
  }
  await check('document-import-render', async () => {
    await clientRoute(page, '/media/documents');
    await pickFile(page, '[data-add]', { name: 'capability.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(['Capability document'])) });
    await page.locator('#document-title').fill('Capability document');
    await page.locator('[data-save-document]').click();
    await page.locator('[data-list-row]').filter({ hasText: 'Capability document' }).click();
    await page.locator('[data-document-page-canvas="drawn"]').waitFor({ timeout: 30000 });
    const ink = await page.locator('[data-document-page-canvas]').first().evaluate(canvas => {
      const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < bytes.length; i += 4) if (bytes[i] < 100 && bytes[i + 3] > 0) dark++;
      return dark;
    });
    assert.ok(ink > 100);
    return { renderedDarkPixels: ink };
  });
  await check('manual-archive-recovery', async () => {
    await clientRoute(page, '/settings/export');
    await page.locator('#exp-pass').fill('capability archive');
    await page.locator('[data-export]').click();
    const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
    await page.locator('[data-confirm-export]').click();
    const download = await downloadPromise;
    const buffer = await readFile(await download.path());
    assert.ok(buffer.length > 1000);
    await pickFile(page, '[data-pick-file]', { name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer });
    await page.locator('#imp-pass').fill('wrong password');
    await page.locator('[data-import]').click();
    await page.locator('[data-import-error="wrong-password"]').waitFor();
    await readNote();
    await clientRoute(page, '/settings/export');
    await pickFile(page, '[data-pick-file]', { name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer });
    await page.locator('#imp-pass').fill('capability archive');
    await page.locator('[data-import-mode="replace"]').click();
    await page.locator('[data-import]').click();
    await page.locator('[data-confirm-replace]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-toast]')].some(toast => /Journal replaced/.test(toast.textContent)), null, { timeout: 120000 });
    await readNote();
    entryPath = await page.getByText(note, { exact: true }).first().locator('xpath=ancestor::a').getAttribute('href');
    await clientRoute(page, entryPath);
    await openSection(page, 'photos');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-editor-section="photos"] img')].some(image => image.complete && image.naturalWidth > 0));
    for (const [section, row] of [['voice', '.recording-row'], ['video', '.video-row']]) {
      await openSection(page, section);
      await page.locator(`${row} [data-transport-toggle]`).first().click();
      await page.waitForFunction(row => [...document.querySelectorAll(`${row} audio, ${row} video`)].some(media => media.currentTime > 0.2 && !media.paused), row);
    }
    await clientRoute(page, '/media/documents');
    await page.locator('[data-list-row]').filter({ hasText: 'Capability document' }).click();
    await page.locator('[data-document-page-canvas="drawn"]').waitFor({ timeout: 30000 });
    return { archiveBytes: buffer.length, wrongPasswordPreservedNote: true, replacedNote: note, restoredAttachmentsUsable: true };
  });
  await check('pending-persistence-request', async () => {
    const isolated = await testContext();
    const pending = await isolated.newPage();
    try {
      await pending.addInitScript(() => { navigator.storage.persist = () => new Promise(() => {}); });
      await firstRun(pending, origin);
      await clientRoute(pending, '/entry/new/2026-10-05?seedMood=4');
      await pending.locator('#ed-note').fill('Save while persistence waits');
      await pending.locator('[data-save]').click();
      await pending.waitForFunction(() => !location.pathname.startsWith('/entry/new/'));
      await clientRoute(pending, '/day/2026-10-05');
      await pending.getByText('Save while persistence waits', { exact: true }).first().waitFor();
      return { fault: 'unanswered persist request', startupAndSaveComplete: true };
    } finally { await isolated.close(); }
  });
  await check('missing-storage-api', async () => {
    const isolated = await testContext({ serviceWorkers: 'block' });
    const fresh = await isolated.newPage();
    let faultResponses = 0;
    try {
      await isolated.route('**/mc-worker-*.js', async route => {
        faultResponses++;
        const response = await route.fetch();
        await route.fulfill({ response, body: "Object.defineProperty(Object.getPrototypeOf(navigator.storage), 'getDirectory', { value: undefined });\n" + await response.text() });
      });
      await reachAccessSetup(fresh, origin);
      await choosePassphrase(fresh, 'missing storage', false);
      await fresh.locator('[data-boot-failure]').waitFor({ timeout: 30000 });
      assert.ok(faultResponses > 0);
      assert.equal(await fresh.locator('[data-app-root][data-boot="ready"]').count(), 0);
      assert.equal(await fresh.locator('[data-entry-card]').count(), 0);
      return { fault: 'required OPFS API removed in real database worker', faultResponses, handledBootFailure: true, journalNotPresentedAsReady: true };
    } finally { await isolated.close(); }
  });

  await check('uncaught-errors', async () => { assert.deepEqual(errors, []); return { count: errors.length }; });
} finally {
  await context.close();
  await browser.close();
  await server.close();
  if (process.env.CAPABILITY_RESULTS) await writeFile(process.env.CAPABILITY_RESULTS, JSON.stringify(results, null, 2) + '\n');
}
if (results.some(result => result.status === 'fail')) process.exitCode = 1;
