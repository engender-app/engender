/* The gates say what happened, in the person's words (after-release ticket
   09), checked on the real components in the gates fixture.

   1. The boot-failure notice, once per failure the boot can name: a
      sentence, never the driver's text, and the doors that failure leaves.
      The raw text is reachable only through "Copy details for a bug report".
   2. A reset that fails says so inside its sheet, on every gate branch that
      offers one. Before this ticket three of them closed the sheet and wrote
      the failure into a line only one branch drew, so a failed "Delete
      everything" looked like nothing had been pressed. The reset is made to
      fail by refusing the OPFS root, which is the first thing it cannot do
      without; nothing on disk is touched.
   3. An access mode's failure never shows on another mode's screen.

   Run alone with `node tests/gates-say-what-happened.mjs`, or as one block
   of the browser tier. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const en = JSON.parse(readFileSync(resolve('messages/en.json'), 'utf8'));

async function scene(page, name, platform = 'web') {
  await page.selectOption('select[aria-label="Platform"]', platform);
  await page.selectOption('select[aria-label="Scene"]', name);
}

export async function verifyGatesSayWhatHappened(report = (line) => console.log(`PASS ${line}`)) {
  const server = await createServer({
    configFile: resolve('tests/browser-tier/browser-tier.vite.config.ts'),
    server: { port: 0 }
  });
  await server.listen();
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://localhost:${server.config.server.port}/gates.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('body[data-gates-ready]', { state: 'attached' });

    /* 1. The boot-failure notice. */
    const failures = await page.evaluate(() => window.bootFailureScenes);
    const doors = {
      'boot-failure-unreadable': { retry: true, wayOut: true },
      'boot-failure-below-baseline': { retry: false, wayOut: true },
      'boot-failure-engine': { retry: true, wayOut: false },
      'boot-failure-unknown': { retry: true, wayOut: false }
    };
    for (const [name, want] of Object.entries(doors)) {
      const { kind, raw } = failures[name];
      await scene(page, name);
      const notice = page.locator(`[data-boot-failure="${kind}"]`);
      await notice.waitFor();
      if (want.wayOut) await notice.locator('[data-unreadable-reset]').waitFor();
      const text = await notice.innerText();
      const sentence = (await notice.locator('[data-boot-failure-sentence]').innerText()).trim();
      const retry = await notice.locator('[data-retry-boot]').count();
      const wayOut = await notice.locator('[data-unreadable-reset]').count();
      assert.ok(sentence.length > 20, `${name}: a sentence (${JSON.stringify(sentence)})`);
      assert.ok(!text.includes(raw), `${name}: the raw text is not on screen (${JSON.stringify(text)})`);
      assert.equal(retry, want.retry ? 1 : 0, `${name}: retry offered ${retry}`);
      assert.equal(wayOut, want.wayOut ? 1 : 0, `${name}: way out offered ${wayOut}`);
      report(`${name}: "${sentence.slice(0, 60)}...", no raw text, retry ${retry}, way out ${wayOut}`);
    }

    /* The bug-report control, on the clipboard's refusal: the same text then
       opens in place, so it is never lost. */
    await scene(page, 'boot-failure-unknown');
    await page.locator('[data-copy-boot-details]').waitFor();
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error('refused by the check'));
    });
    await page.locator('[data-copy-boot-details]').click();
    const details = await page.locator('[data-boot-details]').innerText();
    assert.ok(details.includes(failures['boot-failure-unknown'].raw), `the details hold the raw text (${details})`);
    report('a refused clipboard opens the details in place, raw text and all');

    /* 2. A failed reset, on every branch that offers one. */
    const branches = [
      ['unlock-pin', '[data-forgot-passphrase]', '[data-confirm-reset]'],
      ['unlock-passphrase', '[data-forgot-passphrase]', '[data-confirm-reset]'],
      ['android-key', '[data-forgot-key]', '[data-confirm-reset]'],
      ['android-key-invalidated', '[data-open-reset]', '[data-confirm-reset]'],
      ['session-pin', '[data-forgot]', '[data-confirm-reset]'],
      ['session-passphrase', '[data-forgot]', '[data-confirm-reset]'],
      ['device-recovery', '[data-open-device-reset]', '[data-confirm-device-reset]'],
      ['boot-failure-unreadable', '[data-unreadable-reset]', '[data-confirm-unreadable-reset]']
    ];
    let reported = 0;
    for (const [name, opener, confirm] of branches) {
      await scene(page, name);
      await page.locator(opener).waitFor();
      await page.evaluate(() => {
        window.realDirectory ??= navigator.storage.getDirectory.bind(navigator.storage);
        navigator.storage.getDirectory = () => Promise.reject(new Error('refused by the check'));
      });
      await page.locator(opener).click();
      await page.locator(`[data-sheet] ${confirm}`).click();
      const line = page.locator('[data-sheet] [data-reset-failed]');
      await line.waitFor({ timeout: 5000 });
      assert.equal((await line.innerText()).trim(), en.reset_failed, `${name}: the failure is in the sheet`);
      assert.equal(await page.locator('[data-sheet]').count(), 1, `${name}: the sheet stays open`);
      await page.evaluate(() => {
        navigator.storage.getDirectory = window.realDirectory;
      });
      await page.keyboard.press('Escape');
      await page.locator('[data-sheet]').waitFor({ state: 'detached' });
      /* Reopened, the sheet starts clean: the failure was the last attempt's. */
      await page.locator(opener).click();
      await page.locator(`[data-sheet] ${confirm}`).waitFor();
      assert.equal(await page.locator('[data-sheet] [data-reset-failed]').count(), 0, `${name}: a reopened sheet repeats the old failure`);
      await page.keyboard.press('Escape');
      await page.locator('[data-sheet]').waitFor({ state: 'detached' });
      reported++;
    }
    report(`a failed reset says so inside its sheet on all ${reported} gate branches that offer one, and a reopened sheet starts clean`);

    /* 3. An access mode's failure stays with that mode. Biometric setup is
       the one a browser refuses without anything being typed, and the
       refusal is made immediate rather than left to WebAuthn's timeout. */
    await scene(page, 'access-choice');
    await page.evaluate(() => {
      navigator.credentials.create = () => Promise.reject(new DOMException('refused by the check', 'NotAllowedError'));
    });
    await page.locator('[data-list-row="biometric"]').click();
    await page.locator('[data-access-chosen="biometric"] [data-access-submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-access-status]')?.textContent.trim());
    const biometricError = (await page.locator('[data-access-status]').innerText()).trim();
    await page.locator('[data-access-back]').click();
    await page.locator('[data-list-row="passphrase"]').click();
    await page.locator('[data-access-continue]').click();
    await page.locator('[data-access-secret="passphrase"]').waitFor();
    const passphraseStatus = (await page.locator('[data-access-secret="passphrase"] [data-access-status]').innerText()).trim();
    assert.equal(passphraseStatus, '', `biometric's "${biometricError}" followed the person to the passphrase form`);
    report(`biometric's refusal ("${biometricError.slice(0, 40)}...") does not follow to the passphrase form`);

    assert.deepEqual(errors, [], 'no page errors');
    report('no page errors');
    await page.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1]?.endsWith('gates-say-what-happened.mjs')) {
  await verifyGatesSayWhatHappened();
}
