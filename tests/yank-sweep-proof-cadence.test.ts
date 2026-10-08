// @ts-nocheck
import { it } from 'vitest';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { samplerExpression, INJECT_PROOF_EXPRESSION, findYanks, PROOF, missingProofYanks, VT_NAMES, SCENE_MS } from './yank-sweep-core.mjs';

async function measure(fullTreeBaseline, act = 'inject') {
  let clock = 0;
  let raf = [];
  let observer;
  let styleReads = 0;
  let selected;
  const proof = [];
  const background = [];
  const make = (className = '', top = 0) => {
    const style = { display: 'block', opacity: '1', width: '120px', height: '24px', top: `${top}px`, translate: '0 0px', background: '#888' };
    Object.defineProperty(style, 'cssText', { set(css) {
      for (const declaration of css.split(';')) {
        const [name, value] = declaration.split(':');
        if (name && value) this[name.trim()] = value.trim();
      }
    } });
    const node = {
      style, className, textContent: className, tagName: 'DIV', parentElement: null, scrollTop: 0,
      get classList() { return this.className.split(' ').filter(Boolean); },
      get childNodes() { return [{ nodeType: 3, textContent: this.textContent }]; },
      hasAttribute() { return false; }, getAttribute() { return null; }, closest() { return null; }, querySelector() { return null; },
      remove() {},
      getBoundingClientRect() {
        const y = parseFloat(this.style.top) + parseFloat(this.style.translate.split(' ')[1]);
        return { x: 20, y, left: 20, top: y, right: 140, bottom: y + parseFloat(this.style.height), width: 120, height: parseFloat(this.style.height) };
      }
    };
    return node;
  };
  const root = {
    scrollTop: 0, parentElement: null,
    append(el) { el.parentElement = root; proof.push(el); },
    querySelectorAll(selector) {
      selected = selector;
      return selector === '*' ? [...background, ...proof] : proof.filter(el => el.className.startsWith('yank-proof-'));
    }
  };
  for (let i = 0; i < 600; i++) { const el = make(`background-${i}`, 20); el.parentElement = root; background.push(el); }
  const context = vm.createContext({
    console, location: { pathname: '/', search: '' }, performance: { now: () => clock, timeOrigin: 100000 }, innerWidth: 500, innerHeight: 1000,
    requestAnimationFrame(fn) { raf.push(fn); },
    ResizeObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { observer = null; } },
    document: {
      querySelector: selector => selector === '[data-app-root]' ? root : null,
      createElement() { return make(); },
      body: { append() {} }, documentElement: { dataset: { theme: 'dark' } },
    },
    getComputedStyle(el, pseudo) {
      styleReads++;
      clock += 0.08;
      if (pseudo) return { getPropertyValue() { return ''; } };
      const color = el.style.background === '#000' ? 'rgb(0, 0, 0)' : 'rgb(136, 136, 136)';
      return {
        ...el.style, clipPath: 'none', overflowX: 'visible', overflowY: 'visible',
        backgroundImage: 'none', backgroundColor: color, color: 'rgb(255, 255, 255)',
        borderTopWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', borderRightWidth: '0px',
        boxShadow: 'none', borderTopStyle: 'none', borderTopColor: 'transparent',
        getPropertyValue() { return ''; }
      };
    },
  });
  context.window = context;
  context.scrollY = 0;
  context.Node = { TEXT_NODE: 3 };
  vm.runInContext(`(${INJECT_PROOF_EXPRESSION})()`, context);
  let expression = samplerExpression(act, SCENE_MS, VT_NAMES);
  if (fullTreeBaseline) expression = expression.replace(`live.querySelectorAll(act === 'inject' ? '[class^="yank-proof-"]' : '*')`, `live.querySelectorAll('*')`);
  const pending = vm.runInContext(expression, context);
  let settled = false;
  let failure;
  pending.then(() => settled = true, error => { failure = error; settled = true; });
  for (let i = 0; !settled && i < 500; i++) {
    clock += 16;
    const callbacks = raf;
    raf = [];
    callbacks.forEach(fn => fn(clock));
    observer?.();
    await Promise.resolve();
  }
  if (failure) throw failure;
  assert.equal(settled, true);
  const frames = await pending;
  return { frames, styleReads, selected, findings: findYanks(frames, 'rows') };
}

it('captures every injected shape without sampling unrelated app marks', async () => {
  const old = await measure(true);
  const next = await measure(false);
  const foundCut = result => result.findings.some(row => row.kind === 'vanish' && row.mark.startsWith(PROOF.vanish));
  assert.equal(foundCut(old), false, 'Red: background sampling cost masks injected cut at unchanged rate threshold');
  assert.equal(foundCut(next), true, 'Green: lightweight proof capture catches actual cut');
  assert.deepEqual(missingProofYanks([{ scene: PROOF.scene, styleYanks: next.findings }]), [], 'Every injected style shape remains detected');
  assert.ok(next.styleReads / next.frames.length < old.styleReads / old.frames.length / 4, 'Proof must reduce per-frame style reads rather than adjust detector');
  assert.equal(next.selected, '[class^="yank-proof-"]');
  for (const frame of next.frames) {
    assert.ok(Number.isFinite(frame.at) && Number.isFinite(frame.wallAt));
    assert.equal(typeof frame.active, 'boolean');
    assert.equal(typeof frame.vt, 'object');
    for (const row of Object.values(frame.rows)) {
      for (const field of ['x', 'y', 'w', 'h', 'o', 'c', 'sy']) assert.ok(Number.isFinite(row[field]), `${field}: ${JSON.stringify(row)}`);
      assert.equal(typeof row.v, 'boolean');
      assert.equal(typeof row.leaving, 'boolean');
    }
  }
  const normal = await measure(true, 'none');
  assert.equal(normal.selected, '*', 'Ordinary scenes retain full-tree selection');
  assert.ok(Object.keys(normal.frames[0].rows).some(key => key.startsWith('.background-599|')));
  console.log(JSON.stringify({ red: { frames: old.frames.length, styleReads: old.styleReads, cut: foundCut(old) }, green: { frames: next.frames.length, styleReads: next.styleReads, cut: foundCut(next) }, ordinaryFullTree: true }));

});
