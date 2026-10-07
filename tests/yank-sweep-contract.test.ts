// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { dispatchSceneAction, verifySceneAction, waitForReadiness, coverageSummary } from './yank-sweep-core.mjs';

const control = (over = {}) => ({
  tagName: 'BUTTON', disabled: false, textContent: 'Open',
  getBoundingClientRect: () => ({ width: 48, height: 48 }),
  getAttribute: () => null, closest: () => null, click: vi.fn(),
  ...over
});
const environment = (hits = []) => ({
  document: { querySelectorAll: () => hits },
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
