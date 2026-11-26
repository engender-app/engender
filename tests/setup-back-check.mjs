/* Exercise production setup through browser history or Android's real Back key.
   No journal state is injected; only disposable first-run answers are typed. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { launchChromium, previewBuild } from './browser-harness.mjs';

const [output, serial, pkg] = process.argv.slice(2);
assert.ok(output, 'Pass evidence directory, optionally serial and isolated package');
mkdirSync(output, { recursive: true });
const receipt = { checks: [], sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
let browser, app, forward, page;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 30000 });
const activities = () => adb('shell', 'dumpsys', 'activity', 'activities').split('\n').filter(line => /^\s*(?:mResumedActivity|topResumedActivity|ResumedActivity)\s*[:=]/.test(line));
const foreground = () => activities().some(line => line.includes(pkg + '/'));
async function until(check, label) {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(`Timed out: ${label}`);
}
const settle = async () => {
  await page.waitForFunction(() => !document.getAnimations().some(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)));
};
const click = async locator => {
  if (serial) {
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    await locator.evaluate(node => { document.activeElement?.blur(); node.click(); });
  } else await locator.click();
};
const question = () => page.locator('[data-setup-question]').last().innerText();
async function recordBack(label, action) {
  await settle();
  const cdp = await page.context().newCDPSession(page);
  const paints = [];
  cdp.on('Page.screencastFrame', frame => {
    paints.push({ data: frame.data, metadata: frame.metadata });
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.evaluate(() => {
    window.__setupFrames = [];
    window.__recordSetup = true;
    const tick = t => {
      if (!window.__recordSetup) return;
      window.__setupFrames.push({ t, questions: [...document.querySelectorAll('[data-setup-question]')].map(n => {
        // The question's keyed part carries its fade and travel since ticket 19 (the welcome prints the wordmark beside it).
        const part = n.closest('.setup-ask-part') ?? n;
        const s = getComputedStyle(part), r = n.getBoundingClientRect();
        return { text: n.textContent.trim(), opacity: +s.opacity, transform: s.transform, x: r.x, y: r.y };
      }), blind: getComputedStyle(document.querySelector('.setup')).getPropertyValue('--blind-edge') });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const was = await question();
  await action();
  await page.waitForFunction(was => [...document.querySelectorAll('[data-setup-question]')].some(n => n.textContent.trim() !== was), was);
  await settle();
  const frames = await page.evaluate(() => { window.__recordSetup = false; return window.__setupFrames; });
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  for (let i = 0; i < paints.length; i++) writeFileSync(`${output}/${label}-paint-${String(i).padStart(3, '0')}.png`, Buffer.from(paints[i].data, 'base64'));
  writeFileSync(`${output}/${label}-paints.json`, JSON.stringify(paints.map(p => p.metadata), null, 2));
  writeFileSync(`${output}/${label}-frames.json`, JSON.stringify(frames, null, 2));
  await page.screenshot({ path: `${output}/${label}-settled.png` });
  const destination = frames.at(-1)?.questions.at(-1)?.text;
  const incoming = frames.flatMap(f => f.questions).filter(q => q.text === destination);
  const metrics = {
    frames: frames.length, paints: paints.length,
    firstIncomingOpacity: incoming[0]?.opacity,
    partialIncoming: incoming.filter(q => q.opacity > 0 && q.opacity < 1).length,
    missing: frames.filter(f => !f.questions.some(q => q.opacity > 0)).length,
    blindPositions: new Set(frames.map(f => f.blind)).size
  };
  receipt.motion ??= {};
  receipt.motion[label] = metrics;
  assert.ok(metrics.frames > 3 && metrics.paints > 3, 'Measure multiple actual painted frames');
  assert.ok(metrics.firstIncomingOpacity < 0.05 && metrics.partialIncoming >= 2, 'Incoming question fades from zero, without destination flash');
  assert.equal(metrics.missing, 0, 'No frame loses both questions');
  assert.ok(metrics.blindPositions > 2, 'Field edge travels instead of teleporting');
  return frames;
}
try {
  if (serial) {
    assert.match(pkg, /^dev\.engender\.app\.test\.ui10$/);
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    adb('shell', 'am', 'start', '-n', `${pkg}/dev.engender.app.Launch01`);
    let pid;
    await until(() => { try { pid = adb('shell', 'pidof', pkg).trim().split(/\s+/)[0]; return !!pid; } catch { return false; } }, 'process');
    forward = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`).trim();
    await until(async () => {
      try { browser ??= await chromium.connectOverCDP(`http://127.0.0.1:${forward}`, { timeout: 1000, noDefaults: true }); page = browser.contexts()[0]?.pages()[0]; return !!page; } catch { return false; }
    }, 'WebView');
  } else {
    browser = await launchChromium(); app = await previewBuild(process.env.SETUP_ROOT ?? process.cwd());
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await page.goto(`http://localhost:${app.httpServer.address().port}${process.env.SETUP_ENTRY ?? '/'}`);
  }
  page.setDefaultTimeout(30000);
  receipt.errors = [];
  page.on('pageerror', error => receipt.errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') receipt.errors.push(message.text());
  });
  await page.locator('[data-next]').waitFor();
  if (process.env.SETUP_THEME) await page.evaluate(theme => document.documentElement.dataset.theme = theme, process.env.SETUP_THEME);
  receipt.release = await page.evaluate(async () => (await fetch('/release.json')).json());
  await click(page.locator('[data-next]')); await settle();
  await page.locator('#ob-name').fill('UI10 test name');
  await click(page.locator('[data-next]')); await settle();
  await click(page.locator('[data-palette-pick="trans"]'));
  await click(page.locator('[data-next]')); await settle();
  const scales = page.locator('[data-list-row^="scale-"]');
  await click(scales.first());
  receipt.scales = await scales.first().getAttribute('aria-checked');
  const back = serial ? async () => adb('shell', 'input', 'keyevent', 'KEYCODE_BACK') : () => page.evaluate(() => history.back());
  await recordBack('history-scales-flag', back);
  assert.ok(await page.locator('[data-palette-pick="trans"]').count(), 'Back from Scales must show Flag');
  assert.equal(await page.locator('[data-palette-pick="trans"]').getAttribute('aria-checked'), 'true');
  await recordBack('history-flag-name', back);
  assert.equal(await page.locator('#ob-name').inputValue(), 'UI10 test name');
  receipt.checks.push('Back retains flag and name');
  await click(page.locator('[data-next]')); await settle();
  await click(page.locator('[data-next]')); await settle();
  assert.equal(await scales.first().getAttribute('aria-checked'), receipt.scales);
  receipt.checks.push('Scale selection retained on return');
  await recordBack('arrow-scales-flag', () => click(page.locator('[data-back]')));
  await click(page.locator('[data-next]')); await settle();
  await back();
  await page.locator('[data-palette-pick="trans"]').waitFor();
  await back();
  await page.locator('#ob-name').waitFor();
  assert.equal(await page.locator('#ob-name').inputValue(), 'UI10 test name');
  await settle();
  receipt.checks.push('Repeated Back during transition keeps draft');
  await back(); await settle();
  const welcome = await question();
  if (serial) {
    receipt.welcome = { before: activities() }; await back(); await until(() => !foreground(), 'Welcome Back backgrounds');
    receipt.welcome.after = activities();
    adb('shell', 'am', 'start', '-n', `${pkg}/dev.engender.app.Launch01`);
    await until(foreground, 'return');
  } else { await back(); await settle(); }
  assert.equal(await question(), welcome);
  receipt.checks.push('Welcome Back safe');
  assert.ok(!(await page.evaluate(() => JSON.stringify(history.state) + location.href)).includes('UI10 test name'));
  receipt.checks.push('Name absent from URL/history');
  await click(page.locator('[data-restore-start]')); await settle();
  await back();
  await page.locator('[data-restore-start]').waitFor(); await settle();
  assert.equal(await question(), welcome);
  receipt.checks.push('Restore Back cancels into Welcome');
  for (let i = 0; i < 12 && !await page.locator('[data-access-modes]').count(); i++) {
    await click(page.locator('[data-next]')); await settle();
  }
  await page.locator('[data-access-modes]').waitFor();
  await back(); await settle();
  assert.ok(await page.locator('[data-access-modes]').count(), 'Hard gate cannot be skipped');
  await click(page.locator('[data-access-modes] [data-list-row="passphrase"]')); await settle();
  await click(page.locator('[data-access-continue]')); await settle();
  assert.ok(await page.locator('[data-access-secret="passphrase"]').count());
  await back(); await settle();
  assert.ok(await page.locator('[data-access-chosen="passphrase"]').count(), 'Secret Back retains chosen mode');
  await back(); await settle();
  assert.ok(await page.locator('[data-access-modes]').count(), 'Detail Back returns to list');
  receipt.checks.push('Access-mode secret/detail/list Back preserves hard gate');
  await click(page.locator(`[data-access-modes] [data-list-row="${serial ? 'unlocked' : 'device-bound'}"]`)); await settle();
  await click(page.locator('[data-access-submit]'));
  await page.locator('[data-next]').waitFor(); await settle();
  for (let i = 0; i < 8 && !await page.locator('[data-finish]').count(); i++) {
    if (await page.locator('[data-skip-recovery-offer]').count()) await click(page.locator('[data-skip-recovery-offer]'));
    await click(page.locator('[data-next]')); await settle();
  }
  await click(page.locator('[data-finish]'));
  await page.locator('[data-nav-item="home"]:visible, [data-rail-item="home"]:visible').first().waitFor();
  assert.equal(await page.locator('[data-setup-question]').count(), 0);
  if (!serial) {
    await page.goBack();
    receipt.todayBackUrl = page.url();
    assert.equal(await page.locator('[data-setup-question]').count(), 0);
    if (new URL(page.url()).protocol === 'about:') await page.goForward();
  } else {
    await back();
    await until(() => !foreground(), 'Today Back backgrounds');
    adb('shell', 'am', 'start', '-n', `${pkg}/dev.engender.app.Launch01`);
    await until(foreground, 'Today return');
  }
  await page.locator('[data-nav-item="home"]:visible, [data-rail-item="home"]:visible').first().waitFor();
  assert.equal(await page.locator('[data-setup-question]').count(), 0);
  receipt.checks.push('Start writing then Today Back never reopens setup');

} catch (error) {
  receipt.error = error.stack;
  if (page) receipt.history = await page.evaluate(() => ({ state: history.state, url: location.href, question: document.querySelector('#ob-question')?.textContent, status: document.querySelector('.setup-status')?.textContent, body: document.body.innerText.slice(-1500) })).catch(() => null);
  process.exitCode = 1;
} finally {
  writeFileSync(`${output}/receipt.json`, JSON.stringify(receipt, null, 2));
  if (forward) adb('forward', '--remove', `tcp:${forward}`);
  await browser?.close(); app?.httpServer.close();
}
