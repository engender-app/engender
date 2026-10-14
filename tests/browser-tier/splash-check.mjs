import { launchBrowser, newCapabilityContext } from '../browser-harness.mjs';
import { serveBuild } from '../serve-build.mjs';

import { writeFile } from 'node:fs/promises';
const root = process.cwd();
let defect = null;
const runs = Number(process.env.SPLASH_RUNS ?? 3);
if (!Number.isInteger(runs) || runs < 1) throw new Error('SPLASH_RUNS must be a positive integer');
const engine = process.env.BROWSER_ENGINE ?? 'chromium';
const CAP = 2500, REMOVE = 800, SLACK = 400;

/* Page-side recorder: times of the splash handover and every click seen. */
const recorder = () => {
  const T = (window.__t = {});
  window.__clicks = [];
  const rec = (k) => { if (!(k in T)) T[k] = performance.now(); };
  const look = () => {
    const sp = document.getElementById('splash');
    const ds = document.documentElement.dataset.splash;
    if (sp) rec('seen');
    if (sp && sp.classList.contains('is-answered')) rec('answered');
    if (ds === 'leaving') rec('leaving');
    if (T.seen !== undefined && !sp) rec('gone');
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true });
  document.addEventListener('click', (e) => {
    window.__clicks.push({
      inRoot: !!(e.target instanceof Element && e.target.closest('[data-app-root]')),
      ds: document.documentElement.dataset.splash ?? null,
      splashPresent: !!document.getElementById('splash')
    });
  }, true);
};
/* Keeps the screen "still arriving" for ~2 s with a finite animation, which
   stretches the hold so a real mouse has a window to land in. */
const stretch = () => {
  const w = new MutationObserver(() => {
    const r = document.querySelector('[data-app-root]');
    if (r && r.firstElementChild) {
      w.disconnect();
      r.firstElementChild.animate([{ outlineColor: 'transparent' }, { outlineColor: 'transparent' }], { duration: 2000 });
    }
  });
  w.observe(document, { subtree: true, childList: true });
};
/* A hidden tab: no frames, visibilityState hidden, until __showTab(). */
const hiddenTab = () => {
  const q = [];
  const realRaf = window.requestAnimationFrame.bind(window);
  let hidden = true;
  Object.defineProperty(document, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible'), configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  window.requestAnimationFrame = (cb) => { if (!hidden) return realRaf(cb); q.push(cb); return q.length; };
  window.__showTab = () => {
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    for (const cb of q.splice(0)) realRaf(cb);
  };
};

const welcome = (p) => p.evaluate(() => /Welcome/.test(document.querySelector('[data-app-root]')?.innerText ?? ''));
async function tapNext(p) {
  const box = await p.locator('[data-next]').boundingBox();
  if (!box) return { landed: false, why: 'no button box' };
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  try {
    await p.waitForFunction(() => !/Welcome/.test(document.querySelector('[data-app-root]')?.innerText ?? ''), null, { timeout: 3000 });
    return { landed: true };
  } catch { return { landed: false, why: 'screen did not change within 3 s' }; }
}
const num = (x) => (x === undefined ? null : Math.round(x));

async function fresh(server, { init = [], hold = false } = {}) {
  const browser = await launchBrowser();
  let ctx;
  try {
  ctx = await newCapabilityContext(browser, { viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript(recorder);
  if (defect) await p.addInitScript((name) => {
    if (name === 'never-leaves') {
      const remove = Element.prototype.remove;
      Element.prototype.remove = function () { if (this.id !== 'splash') return remove.call(this); };
    } else if (name === 'no-cap') {
      const timeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, delay, ...args) => timeout(fn, delay === 2500 ? 1e9 : delay, ...args);
    } else {
      const observer = new MutationObserver(() => {
        if (!document.head) return;
        observer.disconnect();
        const style = document.createElement('style');
        style.textContent = name === 'no-taps'
          ? '[data-app-root] { pointer-events: none !important; }'
          : "html[data-splash=''] [data-app-root] {pointer-events:auto!important;opacity:1!important} #splash {pointer-events:none!important}";
        document.head.append(style);
      });
      observer.observe(document, {childList:true,subtree:true});
    }
  }, defect);
  if (hold) await p.addInitScript(stretch);
  for (const f of init) await p.addInitScript(f);
  await p.goto(`http://localhost:${server.httpServer.address().port}/`, { waitUntil: 'commit' });
  return { browser: { close: async () => { try { await ctx.close(); } finally { await browser.close(); } } }, p };
  } catch (error) {
    try { await ctx?.close(); } finally { await browser.close(); }
    throw error;
  }
}

async function probeLeaves(server) {
  const { browser, p } = await fresh(server);
  try {
    try { await p.waitForFunction(() => window.__t.gone !== undefined, null, { timeout: 15000, polling: 50 }); } catch {}
    const t = await p.evaluate(() => window.__t);
    const holdMs = t.leaving - t.answered, fadeMs = t.gone - t.leaving;
    const pass = t.gone !== undefined && holdMs <= CAP + SLACK && fadeMs <= REMOVE + SLACK;
    return { pass, answered: num(t.answered), leaving: num(t.leaving), gone: num(t.gone), holdMs: num(holdMs), fadeMs: num(fadeMs), bound: `hold<=${CAP + SLACK} fade<=${REMOVE + SLACK}` };
  } finally { await browser.close(); }
}

async function probeTap(server) {
  const out = {};
  for (const when of ['at-fade-start', 'after-removal']) {
    const { browser, p } = await fresh(server);
    try {
      if (when === 'at-fade-start') await p.waitForFunction(() => { const s = document.documentElement.dataset.splash; return s === 'leaving' || (s === undefined && window.__t.gone !== undefined); }, null, { timeout: 15000, polling: 'raf' }).catch(() => {});
      else await p.waitForFunction(() => window.__t.gone !== undefined, null, { timeout: 15000, polling: 50 }).catch(() => {});
      out[when] = { ...(await tapNext(p)), splashStillThere: await p.evaluate(() => !!document.getElementById('splash')) };
    } finally { await browser.close(); }
  }
  return { pass: out['at-fade-start'].landed && out['after-removal'].landed, ...out };
}

async function probeUnder(server) {
  const { browser, p } = await fresh(server, { hold: true });
  try {
    const pts = [[195, 400], [195, 300], [195, 500], [100, 700], [300, 700], [195, 650]];
    let sent = 0, i = 0, sawButtonUnderSplash = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const st = await p.evaluate(() => ({ ds: document.documentElement.dataset.splash ?? null, btn: !!document.querySelector('[data-next]') }));
      if (st.ds !== '') { if (st.ds === 'leaving' || st.ds === null) break; }
      if (st.ds === '') {
        if (st.btn) sawButtonUnderSplash = true;
        let [x, y] = pts[i++ % pts.length];
        const box = st.btn && i % 2 ? await p.locator('[data-next]').boundingBox().catch(() => null) : null;
        if (box) { x = box.x + box.width / 2; y = box.y + box.height / 2; }
        await p.mouse.click(x, y); sent++;
      }
    }
    await p.waitForFunction(() => window.__t.gone !== undefined, null, { timeout: 10000 }).catch(() => {});
    const clicks = await p.evaluate(() => window.__clicks);
    const under = clicks.filter((c) => c.ds === '');
    const reached = under.filter((c) => c.inRoot);
    const stillWelcome = await welcome(p);
    const nonVacuous = under.length >= 3 && sawButtonUnderSplash;
    return { pass: nonVacuous && reached.length === 0, sent, clicksSeenUnderSplash: under.length, reachedAppRoot: reached.length, sawButtonUnderSplash, stillOnWelcomeAfter: stillWelcome };
  } finally { await browser.close(); }
}

async function probeHidden(server) {
  const { browser, p } = await fresh(server, { init: [hiddenTab] });
  try {
    await p.waitForTimeout(CAP + REMOVE + 2500);
    const hid = await p.evaluate(() => ({ splash: !!document.getElementById('splash'), ds: document.documentElement.dataset.splash ?? null, welcome: /Welcome/.test(document.querySelector('[data-app-root]')?.innerText ?? ''), vis: document.visibilityState, t: window.__t }));
    await p.evaluate(() => window.__showTab());
    await p.waitForTimeout(600);
    const shown = await p.evaluate(() => ({ splash: !!document.getElementById('splash'), ds: document.documentElement.dataset.splash ?? null }));
    const tap = await tapNext(p);
    return { pass: !hid.splash && hid.welcome && !shown.splash && tap.landed, hiddenAfterMs: CAP + REMOVE + 2500, whileHidden: { splashPresent: hid.splash, dataSplash: hid.ds, welcomeDrawn: hid.welcome, vis: hid.vis, answered: num(hid.t.answered), leaving: num(hid.t.leaving), gone: num(hid.t.gone) }, afterShown: shown, tap };
  } finally { await browser.close(); }
}

const server = await serveBuild(root);
const probes = { leaves: probeLeaves, tap: probeTap, under: probeUnder, hidden: probeHidden };
const rows = [];
const names = { leaves: 'splash-leaves', tap: 'splash-first-tap', under: 'splash-blocks-input', hidden: 'splash-hidden-boot' };
const defects = { leaves: 'never-leaves', tap: 'no-taps', under: 'taps-under', hidden: 'no-cap' };
try {
  for (const [name, fn] of Object.entries(probes)) {
    const observations = [];
    for (let run = 1; run <= runs; run++) {
      defect = null;
      let result;
      try { result = await fn(server); } catch (error) { result = { pass: false, error: error.message }; }
      observations.push({ run, ...result });
      console.log(JSON.stringify({ engine, probe: name, run, ...result }));
    }
    defect = defects[name];
    let control;
    try { control = await fn(server); } catch (error) { control = { pass: false, error: error.message }; }
    const controlRejected = !control.pass && !control.error;
    rows.push({ capability: names[name], status: observations.every(item => item.pass) && controlRejected ? 'pass' : 'fail',
      evidence: { observations, defect: { name: defect, rejected: controlRejected, ...control } } });
    console.log(JSON.stringify(rows.at(-1)));
  }
} finally {
  await server.close();
  if (process.env.CAPABILITY_RESULTS) await writeFile(process.env.CAPABILITY_RESULTS, JSON.stringify(rows, null, 2) + '\n');
}
if (rows.length !== 4 || rows.some(row => row.status !== 'pass')) process.exitCode = 1;
