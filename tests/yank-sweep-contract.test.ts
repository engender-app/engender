// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { dispatchSceneAction, verifySceneAction, waitForReadiness, coverageSummary } from './yank-sweep-core.mjs';

const control = (over = {}) => ({
  tagName: 'BUTTON', disabled: false, textContent: 'Open',
  getBoundingClientRect: () => ({ width: 48, height: 48, left: 0, top: 0 }),
  contains: () => false,
  getAttribute: () => null, closest: () => null, click: vi.fn(),
  ...over
});
const environment = (hits = []) => ({
  document: { querySelectorAll: () => hits, elementFromPoint: () => hits[0] },
  location: { pathname: '/settings', search: '' },
  getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
});

describe('shared sweep action contract', () => {
  it('rejects missing targets instead of sampling a silent no-op', () => {
    expect(() => dispatchSceneAction({ act: '#gone' }, environment())).toThrow('missing target');
  });
  it('rejects disabled and hidden controls', () => {
    expect(() => dispatchSceneAction({ act: '#disabled' }, environment([control({ disabled: true })]))).toThrow('enabled');
    expect(() => dispatchSceneAction({ act: '#hidden' }, environment([control({ getBoundingClientRect: () => ({ width: 0, height: 0 }) })]))).toThrow('visible');
  });
  it('rejects a control hidden by an ancestor', () => {
    const parent = {};
    const env = environment([control({ parentElement: parent })]);
    env.getComputedStyle = (node) => ({ display: 'block', visibility: 'visible', opacity: node === parent ? '0' : '1' });
    expect(() => dispatchSceneAction({ act: '#covered' }, env)).toThrow('visible');
  });
  it('records chosen control and dispatch, then rejects stale destination', () => {
    const hit = control();
    const action = dispatchSceneAction({ act: '#open', after: { route: '/settings/tags' } }, environment([hit]));
    expect(hit.click).toHaveBeenCalledOnce();
    expect(action).toMatchObject({ requested: '#open', dispatched: true, beforeRoute: '/settings' });
    expect(() => verifySceneAction({ after: { route: '/settings/tags' } }, action, environment([hit]))).toThrow('postcondition');
  });
  it('rejects navigation that never leaves its original destination', () => {
    const action = { dispatched: true, beforeRoute: '/settings', requested: '#open' };
    expect(() => verifySceneAction({ after: { route: '/settings' } }, action, environment())).toThrow('unchanged');
  });
});

describe('bounded boot readiness', () => {
  it('waits beyond historical 30 seconds with progress feedback', async () => {
    let time = 0;
    const feedback = vi.fn();
    const result = await waitForReadiness(async () => ({ ready: time >= 300000, gate: 'seeding' }), {
      timeoutMs: 600000, pollMs: 10000, now: () => time,
      sleep: async (ms) => { time += ms; }, onProgress: feedback
    });
    expect(result.ready).toBe(true);
    expect(time).toBe(300000);
    expect(feedback).toHaveBeenCalled();
  });
  it('names unfinished setup at bounded timeout', async () => {
    let time = 0;
    await expect(waitForReadiness(async () => ({ ready: false, gate: 'access-mode' }), {
      timeoutMs: 100, pollMs: 50, now: () => time, sleep: async (ms) => { time += ms; }
    })).rejects.toThrow('access-mode');
  });
});

it('coverage distinguishes missing runs, skips and errors from measured scenes', () => {
  const summary = coverageSummary([{ name: 'one' }, { name: 'two' }], ['persona'], ['light'], 2, [
    { scene: 'one', profile: 'persona', theme: 'light', pass: 1, frames: 8 },
    { scene: 'one', profile: 'persona', theme: 'light', pass: 2, error: 'missing target' },
    { scene: 'two', profile: 'persona', theme: 'light', pass: 1, skipped: 'unsupported' }
  ]);
  expect(summary).toMatchObject({ requested: 4, attempted: 2, measured: 1, skipped: 1, failed: 1, missing: 1 });
});

describe('stable sampled node identity', () => {
  it('keeps one node through class and text changes', async () => {
    const { createMarkIdentity } = await import('./yank-sweep-core.mjs');
    const key = createMarkIdentity();
    const node = {};
    expect(key(node, '.image|Old')).toBe(key(node, '.image.replacing|New'));
  });
  it('distinguishes actual removal and replacement with identical semantic labels', async () => {
    const { createMarkIdentity } = await import('./yank-sweep-core.mjs');
    const key = createMarkIdentity();
    expect(key({}, '.image|Same')).not.toBe(key({}, '.image|Same'));
  });
});

it('requires painted proof in every profile, theme and repeat', async () => {
  const { missingPaintedProof, PROOF } = await import('./yank-sweep-core.mjs');
  expect(missingPaintedProof([
    { scene: PROOF.scene, profile: 'persona', theme: 'light', pass: 1, pixelFindings: [{ areaPct: 0.1 }] },
    { scene: PROOF.scene, profile: 'persona', theme: 'dark', pass: 2, pixelFindings: [] }
  ])).toEqual(['persona:dark:pass 2: camera saw no injected painted defect']);
});

it('keeps first-run gestures out of the persona journal', async () => {
  const { scenesFor } = await import('./yank-sweep-core.mjs');
  expect(scenesFor().filter((scene) => scene.firstRun).every((scene) => scene.when === 'empty')).toBe(true);
});

it('requires explicit outcomes for every supported gesture', async () => {
  const { scenesFor } = await import('./yank-sweep-core.mjs');
  for (const scene of scenesFor()) expect(scene.after, scene.name).toBeDefined();
});

it('measures opposite theme directions under the requested starting theme', async () => {
  const { sceneForTheme, scenesFor } = await import('./yank-sweep-core.mjs');
  const scene = scenesFor().find((candidate) => candidate.name === 'settings-theme-switcher');
  expect(sceneForTheme(scene, 'light')).toMatchObject({ startTheme: 'light', after: { value: 'dark' } });
  expect(sceneForTheme(scene, 'dark')).toMatchObject({ startTheme: 'dark', after: { value: 'light' } });
});

it('rejects measured actions under the wrong starting theme', () => {
  expect(() => verifySceneAction({ act: '#open', startTheme: 'dark', after: { route: '/settings' } },
    { dispatched: true, beforeRoute: '/', beforeTheme: 'light' }, environment())).toThrow('starting theme');
});

it('rejects a PIN gate whose prepared journal or theme does not match', async () => {
  const { verifyGateProof } = await import('./yank-sweep-core.mjs');
  const proof = { themeProof: { selected: true, persisted: 'light', painted: 'light', transitioning: false }, route: '/', profile: 'empty', hasEntries: '0', theme: 'light', boot: 'needs-unlock', pin: true, home: false };
  expect(() => verifyGateProof(proof, 'persona', 'light')).toThrow('profile');
  expect(() => verifyGateProof({ ...proof, profile: 'persona', hasEntries: '1' }, 'persona', 'dark')).toThrow('theme');
  expect(verifyGateProof({ ...proof, profile: 'persona', hasEntries: '1' }, 'persona', 'light')).toMatchObject({ gate: 'pin' });
});

describe('query-driven cold surfaces', () => {
  const proof = async (name, { search = '', surface = true, extraQuery = '' } = {}) => {
    const { coldLoadProofExpression, hydrationScreensFor } = await import('./yank-sweep-core.mjs');
    const { runInNewContext } = await import('node:vm');
    const scene = hydrationScreensFor({ only: [name] })[0];
    return runInNewContext(coldLoadProofExpression(scene.at + extraQuery, 'persona', 'light', scene.coldOutcome), {
      URL,
      location: { origin: 'https://journal.test', pathname: new URL(scene.at, 'https://journal.test').pathname, search },
      localStorage: { getItem: (key) => key === 'engender-has-entries' ? '1' : key === 'engender-boot-prefs' ? JSON.stringify({ theme: 'light' }) : 'persona' },
      document: {
        documentElement: { dataset: { theme: 'light' } },
        querySelectorAll: () => [{ textContent: 'Light', classList: { contains: () => true } }],
        querySelector: (selector) => selector === '[data-app-root]' ? { dataset: { boot: 'ready' } }
          : selector === scene.coldOutcome?.selector && surface ? { checkVisibility: () => true } : null
      }
    });
  };
  for (const name of ['entry-templates', 'presentations', 'quick-log-dims']) {
    it(`${name} proves its intended surface after consuming only its trigger query`, async () => {
      expect(await proof(name)).toMatchObject({ surface: true });
      await expect(proof(name, { surface: false })).rejects.toThrow('surface');
      await expect(proof(name, { search: '?unrelated=lost' })).rejects.toThrow('route');
      await expect(proof(name, { extraQuery: '&keep=1' })).rejects.toThrow('route');
    });
  }
  it('ordinary query routes still require their exact query', async () => {
    const { coldLoadProofExpression } = await import('./yank-sweep-core.mjs');
    const { runInNewContext } = await import('node:vm');
    expect(() => runInNewContext(coldLoadProofExpression('/settings?unrelated=kept', 'persona', 'light'), {
      URL, location: { origin: 'https://journal.test', pathname: '/settings', search: '' },
      localStorage: { getItem: (key) => key === 'engender-boot-prefs' ? '{}' : 'persona' },
      document: { documentElement: { dataset: { theme: 'light' } }, querySelectorAll: () => [], querySelector: () => null }
    })).toThrow('route');
  });
});

it('opens the presentations manager after closing old overlays, then proves the new editor', async () => {
  const { scenesFor } = await import('./yank-sweep-core.mjs');
  expect(scenesFor().find((scene) => scene.name === 'presentations-add')).toMatchObject({
    at: '/settings', prepare: ['[data-list-row="presentations"]'], after: { selector: '[name="presentation-name"]' }
  });
});

describe('keyboard gesture preparation', () => {
  it('focuses and exposes the intended grip before sampling', async () => {
    const hit = control({ getBoundingClientRect: () => ({ width: 48, height: 48, left: 20, top: 200 }) });
    const env = environment([hit]);
    hit.focus = vi.fn(() => { env.document.activeElement = hit; });
    hit.scrollIntoView = vi.fn();
    hit.contains = () => false;
    env.document.elementFromPoint = () => hit;
    dispatchSceneAction({ act: '[data-edit-grip]', key: 'ArrowDown' }, env, true);
    expect(hit.focus).toHaveBeenCalledOnce();
    expect(hit.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
    expect(env.document.activeElement).toBe(hit);
    env.document.elementFromPoint = () => control();
    expect(() => dispatchSceneAction({ act: '[data-edit-grip]', key: 'ArrowDown' }, env, true)).toThrow('covered');
    hit.focus = () => { env.document.activeElement = null; };
    expect(() => dispatchSceneAction({ act: '[data-edit-grip]', key: 'ArrowDown' }, env, true)).toThrow('focus');
  });
  it('rejects a keyboard dispatch without prior target focus', () => {
    const hit = control({ dispatchEvent: vi.fn() });
    const env = environment([hit]);
    env.KeyboardEvent = class {};
    expect(() => dispatchSceneAction({ act: '[data-edit-grip]', key: 'ArrowDown' }, env)).toThrow('focus');
    expect(hit.dispatchEvent).not.toHaveBeenCalled();
    env.document.activeElement = hit;
    expect(dispatchSceneAction({ act: '[data-edit-grip]', key: 'ArrowDown' }, env)).toMatchObject({ dispatched: true });
  });
});

it('restores the requested real theme after palette preparation resets appearance', async () => {
  const { prepareSceneExpression, sceneForTheme, scenesFor } = await import('./yank-sweep-core.mjs');
  const { runInNewContext } = await import('node:vm');
  for (const theme of ['light', 'dark']) {
    const selected = [];
    const env = environment();
    env.document.documentElement = { dataset: { theme } };
    env.localStorage = { getItem: () => JSON.stringify({ theme: env.document.documentElement.dataset.theme }) };
    env.document.querySelector = () => null;
    const cache = new Map();
    env.document.querySelectorAll = (selector) => {
      if (cache.has(selector)) return cache.get(selector);
      const hits = selector.startsWith('[data-palette-pick') || selector.startsWith('[data-segmented="theme"]')
      ? [control({ scrollIntoView: () => { env.document.elementFromPoint = () => env.document.querySelectorAll(selector)[0]; }, click: () => {
        selected.push(selector);
        env.document.documentElement.dataset.theme = selector.includes('data-segment="dark"') ? 'dark' : 'light';
      } })] : [];
      cache.set(selector, hits);
      return hits;
    };
    const scene = sceneForTheme(scenesFor().find((item) => item.name === 'settings-palette'), theme);
    await runInNewContext(prepareSceneExpression(scene), env);
    expect(selected).toEqual(['[data-palette-pick="trans"]', `[data-segmented="theme"] [data-segment="${theme}"]`]);
    expect(env.document.documentElement.dataset.theme).toBe(theme);
  }
});

it('rejects fixed-navigation occlusion and prepares the intended click before capture', () => {
  const hit = control({ getBoundingClientRect: () => ({ width: 48, height: 48, left: 20, top: 796 }) });
  const nav = control();
  const env = environment([hit]);
  env.document.elementFromPoint = () => nav;
  hit.contains = () => false;
  hit.scrollIntoView = vi.fn(() => { env.document.elementFromPoint = () => hit; });
  expect(() => dispatchSceneAction({ act: '[data-strip-earlier]' }, env)).toThrow('covered');
  expect(hit.click).not.toHaveBeenCalled();
  expect(dispatchSceneAction({ act: '[data-strip-earlier]' }, env, true)).toMatchObject({ prepared: true, dispatched: false });
  expect(hit.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
  expect(hit.click).not.toHaveBeenCalled();
  expect(dispatchSceneAction({ act: '[data-strip-earlier]' }, env)).toMatchObject({ dispatched: true });
  env.document.elementFromPoint = () => ({ parentElement: hit });
  hit.contains = (node) => node?.parentElement === hit;
  expect(dispatchSceneAction({ act: '[data-strip-earlier]' }, env)).toMatchObject({ dispatched: true });
});

it('keeps cold-load and injected proof actions explicitly programmatic', () => {
  const env = environment();
  env.document.elementFromPoint = () => { throw new Error('no control to hit-test'); };
  env.__yankProof = vi.fn();
  expect(dispatchSceneAction({ act: 'none' }, env)).toMatchObject({ programmatic: 'cold-load', dispatched: true });
  expect(dispatchSceneAction({ act: 'inject' }, env)).toMatchObject({ programmatic: 'injected proof', dispatched: true });
  expect(env.__yankProof).toHaveBeenCalledOnce();
});

it('finds an exposed scrim inset when its center is covered, but rejects full coverage', () => {
  const hit = control({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) });
  const fan = control();
  const env = environment([hit]);
  env.innerWidth = 390;
  env.innerHeight = 844;
  env.document.elementFromPoint = (x, y) => x < 50 && y < 50 ? hit : fan;
  expect(dispatchSceneAction({ act: '.fan-scrim' }, env)).toMatchObject({
    point: { x: 8, y: 8 }, hit: { target: true }, dispatched: true
  });
  env.document.elementFromPoint = () => fan;
  expect(() => dispatchSceneAction({ act: '.fan-scrim' }, env)).toThrow('covered');
  hit.getBoundingClientRect = () => ({ left: 400, top: 0, width: 48, height: 48 });
  env.document.elementFromPoint = () => hit;
  expect(() => dispatchSceneAction({ act: '.fan-scrim' }, env)).toThrow('outside viewport');
});

it('waits for actual theme reset transition and boot mirror before preparing its opposite', async () => {
  const { prepareSceneExpression, sceneForTheme, scenesFor } = await import('./yank-sweep-core.mjs');
  const { runInNewContext } = await import('node:vm');
  let persisted = 'dark';
  const root = { dataset: { theme: 'light' } };
  const env = environment();
  const light = control({ scrollIntoView: () => {}, click: () => { root.dataset.appearanceTransition = ''; } });
  const dark = control({ scrollIntoView: () => {} });
  env.document.documentElement = root;
  env.document.querySelector = () => null;
  env.document.querySelectorAll = (selector) => selector.includes('data-segment="light"') ? [light]
    : selector.includes('data-segment="dark"') ? [dark] : [];
  env.document.elementFromPoint = () => root.dataset.appearanceTransition !== undefined ? control()
    : persisted === 'dark' ? light : dark;
  env.localStorage = { getItem: () => JSON.stringify({ theme: persisted }) };
  let waits = 0;
  env.setTimeout = (callback) => {
    waits++;
    if (waits === 2) persisted = 'light';
    delete root.dataset.appearanceTransition;
    callback();
  };
  const scene = sceneForTheme(scenesFor().find((item) => item.name === 'settings-theme-switcher'), 'light');
  await runInNewContext(prepareSceneExpression(scene), env);
  expect(persisted).toBe('light');
  expect(waits).toBe(2);
  expect(dark.click).not.toHaveBeenCalled();
});

it('orders reversed compositor arrivals before the detector can invent an A-B-A flash', async () => {
  const { insertScreencastFrame, findPixelYanks } = await import('./yank-sweep-core.mjs');
  const gray = new Uint8Array(400).fill(100);
  const changed = gray.slice();
  for (let y = 4; y < 10; y++) for (let x = 4; x < 10; x++) changed[y * 20 + x] = 220;
  const arrivals = [{ at: 2417403, gray }, { at: 2429363, gray: changed }, { at: 2424320, gray }];
  expect(findPixelYanks(arrivals.map((frame) => frame.gray), 20, 20, arrivals.map((frame) => frame.at)).findings.length).toBeGreaterThan(0);
  const captured = [];
  for (const frame of arrivals) insertScreencastFrame(captured, frame);
  expect(captured.map((frame) => frame.at)).toEqual([2417403, 2424320, 2429363]);
  expect(captured).toHaveLength(arrivals.length);
  expect(findPixelYanks(captured.map((frame) => frame.gray), 20, 20, captured.map((frame) => frame.at)).findings).toEqual([]);
  const sameClock = { at: 2424320, gray: changed };
  insertScreencastFrame(captured, sameClock);
  expect(captured[2]).toBe(sameClock);
});


describe('full persona fixture readiness', () => {
  const run = async (options = {}) => {
    const { runInNewContext } = await import('node:vm');
    const { FILL_EVERY_FEATURE_EXPRESSION } = await import('./yank-sweep-core.mjs');
    const click = vi.fn();
    const result = runInNewContext(FILL_EVERY_FEATURE_EXPRESSION, {
      document: { querySelector: (selector) => selector === '[data-fill-every-feature]'
        ? (options.missing ? null : { click })
        : selector.includes('data-boot') ? (options.ready === false ? null : {}) : null },
      location: { pathname: options.path ?? '/more' },
      localStorage: { getItem: () => options.entries ?? '1' },
      setTimeout: (resolve) => resolve()
    });
    return result;
  };
  it('rejects missing fill control', async () => {
    await expect(run({ missing: true })).rejects.toThrow('no Fill every feature button');
  });
  it('rejects unfinished or empty fixture', async () => {
    for (const options of [{ path: '/' }, { ready: false }, { entries: '0' }]) {
      await expect(run(options)).rejects.toThrow('full persona fixture');
    }
  });
  it('accepts seeded ready More destination', async () => {
    await expect(run()).resolves.toBe(true);
  });
});


describe('requested theme fixture alignment', () => {
  const run = async (stuck = false) => {
    const { runInNewContext } = await import('node:vm');
    const { SETTLE_PAGE_EXPRESSION } = await import('./yank-sweep-core.mjs');
    let persisted = 'dark';
    let selected = 'dark';
    const dataset = { theme: 'light' };
    const button = { textContent: 'Light', classList: { contains: () => selected === 'light' },
      click: () => { if (!stuck) { persisted = 'light'; selected = 'light'; dataset.theme = 'light'; } } };
    return runInNewContext(SETTLE_PAGE_EXPRESSION('light'), {
      document: { getElementById: () => ({}), querySelectorAll: (selector) => selector === '.demo-bar button' ? [button] : [],
        body: { classList: { remove: () => {} } }, documentElement: { dataset } },
      localStorage: { getItem: () => JSON.stringify({ theme: persisted }) },
      setTimeout: (resolve) => resolve()
    });
  };
  it('restores runtime and persisted preference even when DOM already matches', async () => {
    await expect(run()).resolves.toMatchObject({ selected: true, persisted: 'light', painted: 'light', transitioning: false });
  });
  it('rejects stamped DOM when runtime preference cannot align', async () => {
    await expect(run(true)).rejects.toThrow('requested theme did not align');
  });
});

it('waits for prerequisite and main controls before dispatch preparation', async () => {
  const { prepareSceneExpression } = await import('./yank-sweep-core.mjs');
  const { runInNewContext } = await import('node:vm');
  let polls = 0;
  let opened = false;
  const prerequisite = control({ scrollIntoView: () => {}, click: vi.fn(() => { opened = true; }) });
  const main = control({ scrollIntoView: () => {} });
  const env = environment();
  env.document.documentElement = { dataset: { theme: 'light' } };
  env.document.querySelector = () => null;
  env.document.querySelectorAll = (selector) => selector === '#open' ? [prerequisite]
    : selector === '#main' && opened ? [main] : [];
  env.document.elementFromPoint = () => opened ? main : prerequisite;
  env.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: polls < 2 ? '0' : '1' });
  env.setTimeout = (resolve) => { polls++; resolve(); };
  await runInNewContext(prepareSceneExpression({ name: 'late-controls', prepare: ['#open'], act: '#main' }), env);
  expect(prerequisite.click).toHaveBeenCalledOnce();
  expect(main.click).not.toHaveBeenCalled();
  expect(env.__sweepPreparation.steps).toHaveLength(2);
  expect(env.__sweepPreparation.steps[0].attempts).toBe(3);
});

it('retains preparation failure after bounded missing-control wait', async () => {
  const { prepareSceneExpression } = await import('./yank-sweep-core.mjs');
  const { runInNewContext } = await import('node:vm');
  const env = environment();
  env.document.querySelector = () => null;
  env.setTimeout = (resolve) => resolve();
  await expect(runInNewContext(prepareSceneExpression({ name: 'missing', act: '#gone' }), env)).rejects.toThrow('preparation did not become ready');
  expect(env.__sweepPreparation.error).toContain('missing target: #gone');
});

it('changes span fixture before each measured band selection', async () => {
  const { prepareSceneExpression, dispatchSceneAction, verifySceneAction } = await import('./yank-sweep-core.mjs');
  const { runInNewContext } = await import('node:vm');
  let start = '100';
  const timeline = { getAttribute: (name) => name === 'data-rail-start' ? '0' : start };
  const env = environment();
  const band = control({ scrollIntoView: () => { env.document.elementFromPoint = () => band; }, click: () => { start = '100'; } });
  const handle = control({ scrollIntoView: () => { env.document.elementFromPoint = () => handle; },
    focus: () => { env.document.activeElement = handle; }, dispatchEvent: () => { start = '90'; } });
  env.document.documentElement = { dataset: { theme: 'light' } };
  env.document.querySelector = (selector) => selector === '[data-span-timeline]' ? timeline : null;
  env.document.querySelectorAll = (selector) => selector === '[data-span-band]' ? [band]
    : selector === '[data-span-handle="start"]' ? [handle] : selector === '[data-span-timeline]' ? [timeline] : [];
  env.KeyboardEvent = class {};
  env.setTimeout = (resolve) => resolve();
  const scene = { name: 'segment-lookback', act: '[data-span-band]', after: { selector: '[data-span-timeline]', attribute: 'data-span-start' } };
  for (let pass = 0; pass < 3; pass++) {
    await runInNewContext(prepareSceneExpression(scene), env);
    expect(start).toBe('90');
    const action = dispatchSceneAction(scene, env);
    expect(verifySceneAction(scene, action, env).verified).toBe(true);
  }
});

it('prepares disjoint dismissed span, measures naming offer, and proves cleanup', async () => {
  const { prepareSceneExpression, cleanupSceneExpression, dispatchSceneAction, verifySceneAction } = await import('./yank-sweep-core.mjs');
  const { runInNewContext } = await import('node:vm');
  let start = '100', end = '200', offer = true;
  const timeline = { getAttribute: (name) => name === 'data-rail-start' ? '0' : name === 'data-span-start' ? start : end };
  const env = environment();
  const target = (over) => {
    const node = control({ ...over, scrollIntoView: () => { env.document.elementFromPoint = () => node; }, focus: () => { env.document.activeElement = node; } });
    return node;
  };
  const band = target({ click: () => { start = '100'; end = '200'; offer = true; } });
  const startHandle = target({ dispatchEvent: () => { start = '0'; offer = true; } });
  const endHandle = target({ dispatchEvent: () => { end = '0'; offer = true; } });
  const dismiss = target({ click: () => { expect(start === '0' && end === '0' || start === '100' && end === '200').toBe(true); offer = false; } });
  env.document.documentElement = { dataset: { theme: 'light' } };
  const nodes = { '[data-span-band]': band, '[data-span-handle="start"]': startHandle, '[data-span-handle="end"]': endHandle, '[data-era-offer-dismiss]': dismiss, '[data-span-timeline]': timeline };
  env.document.querySelector = (selector) => selector === '[data-era-offer]' ? (offer ? {} : null) : nodes[selector] ?? null;
  env.document.querySelectorAll = (selector) => selector === '[data-era-offer]' ? (offer ? [{}] : []) : nodes[selector] ? [nodes[selector]] : [];
  env.KeyboardEvent = class {};
  env.setTimeout = (resolve) => resolve();
  const scene = { name: 'span-offer-appear', act: '[data-span-band]', after: { selector: '[data-era-offer]' } };
  await runInNewContext(prepareSceneExpression(scene), env);
  expect(offer).toBe(false);
  const action = dispatchSceneAction(scene, env);
  expect(verifySceneAction(scene, action, env).verified).toBe(true);
  expect(await runInNewContext(cleanupSceneExpression(scene), env)).toMatchObject({ verified: true });
  expect(offer).toBe(false);
  expect(env.__sweepAction).toBe(action);
});

it('preserves recording failure alongside screencast cleanup errors', async () => {
  const { screencast } = await import('./browser-harness.mjs');
  const session = { on: () => {}, send: async (method) => { if (method === 'Page.stopScreencast') throw new Error('stop failed'); }, detach: async () => { throw new Error('detach failed'); } };
  const page = { context: () => ({ newCDPSession: async () => session }) };
  try {
    await screencast(page, async () => { throw new Error('capture failed'); });
    throw new Error('expected capture failure');
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors.map(String)).toEqual(['Error: capture failed', 'Error: stop failed', 'Error: detach failed']);
  }
});

it('resets mounted state before each same-route native scene', async () => {
  const { prepareSceneExpression, scenesFor, navigateSweepPage } = await import('./yank-sweep-core.mjs');
  const { runInNewContext } = await import('node:vm');
  let expanded = false;
  const env = environment();
  const toggle = control({
    scrollIntoView: () => { env.document.elementFromPoint = () => toggle; },
    getAttribute: (name) => name === 'aria-expanded' ? String(expanded) : null,
    click: vi.fn(() => { expanded = !expanded; })
  });
  const row = control({ scrollIntoView: () => { env.document.elementFromPoint = () => row; } });
  env.document.querySelector = () => null;
  env.document.querySelectorAll = (selector) => selector === '[data-ms-log-toggle]' ? [toggle]
    : selector.startsWith('[data-milestone]') && expanded ? [row] : [];
  env.setTimeout = (resolve) => resolve();
  env.location = { pathname: '/transition/milestones', search: '', assign: vi.fn(() => { expanded = false; }) };
  for (const name of ['milestones-edit', 'milestone-delete-ask']) {
    const scene = scenesFor().find((scene) => scene.name === name);
    for (let pass = 0; pass < 3; pass++) {
      navigateSweepPage(scene.at, env);
      await runInNewContext(prepareSceneExpression(scene), env);
      expect(expanded).toBe(true);
    }
  }
  expect(toggle.click).toHaveBeenCalledTimes(6);
  expect(env.location.assign).toHaveBeenCalledTimes(6);
});


it('enables hidden measurement controls without adding entries and restores feature visibility', async () => {
  const { prepareSceneExpression, cleanupSceneExpression, scenesFor } = await import('./yank-sweep-core.mjs');
  const { runInNewContext } = await import('node:vm');
  for (const initiallyEnabled of [false, true]) {
    let enabled = initiallyEnabled;
    const env = environment();
    const toggle = control({
      scrollIntoView: () => { env.document.elementFromPoint = () => toggle; },
      getAttribute: (name) => name === 'aria-checked' ? String(enabled) : null,
      click: vi.fn(() => { enabled = !enabled; })
    });
    const cm = control({ scrollIntoView: () => { env.document.elementFromPoint = () => cm; } });
    const inches = control({ scrollIntoView: () => { env.document.elementFromPoint = () => inches; } });
    const selector = '[data-measurements-toggle] button.switch';
    env.document.querySelectorAll = (query) => query === selector ? [toggle]
      : enabled && query.includes('[data-segment="cm"]') ? [cm]
      : enabled && query.includes('[data-segment="in"]') ? [inches] : [];
    env.document.querySelector = (query) => env.document.querySelectorAll(query)[0] ?? null;
    env.setTimeout = (resolve) => resolve();
    const scene = scenesFor().find((scene) => scene.name === 'settings-unit-switcher');
    for (let pass = 0; pass < 3; pass++) {
      await runInNewContext(prepareSceneExpression(scene), env);
      expect(enabled).toBe(true);
      expect(() => JSON.stringify(env.__sweepPreparation)).not.toThrow();
      const cleanup = await runInNewContext(cleanupSceneExpression(scene), env);
      expect(enabled).toBe(initiallyEnabled);
      await runInNewContext(cleanupSceneExpression(scene), env);
      expect(enabled).toBe(initiallyEnabled);
      if (!initiallyEnabled) expect(cleanup).toMatchObject({ verified: true, dispatched: true });
    }
    expect(toggle.click).toHaveBeenCalledTimes(initiallyEnabled ? 0 : 6);
  }
});


it('restores unit feature on failed scenes and preserves cleanup failure separately', async () => {
  const { cleanupSceneFailure } = await import('./yank-sweep-core.mjs');
  const { runInNewContext } = await import('node:vm');
  const scene = { name: 'settings-unit-switcher' };
  let enabled = true;
  const toggle = control({ scrollIntoView: () => {},
    getAttribute: (name) => name === 'aria-checked' ? String(enabled) : null, click: () => { enabled = !enabled; } });
  const env = environment([toggle]);
  env.document.querySelector = () => toggle;
  env.__sweepPreparation = { measurementsOriginallyEnabled: false };
  env.setTimeout = (resolve) => resolve();
  const evaluate = (expression) => runInNewContext(expression, env);
  expect(await cleanupSceneFailure(scene, evaluate)).toMatchObject({ verified: true });
  expect(enabled).toBe(false);
  expect(await cleanupSceneFailure(scene, evaluate)).toBeNull();
  enabled = true;
  toggle.disabled = true;
  expect(await cleanupSceneFailure(scene, evaluate))
    .toEqual({ error: 'Error: measurement feature cleanup control did not become ready' });
  expect(enabled).toBe(true);
  const unused = vi.fn();
  expect(await cleanupSceneFailure({ name: 'other' }, unused)).toBeNull();
  expect(unused).not.toHaveBeenCalled();
});
