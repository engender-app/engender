import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OnNavigate } from '@sveltejs/kit';
import { animateAndroidTab, finishAndroidTab } from './androidTabMotion';
import { ui } from '$lib/stores/ui.svelte';

vi.mock('$lib/motion/blindSettle', () => import('../motion/blindSettle'));
vi.mock('$lib/motion/tokens', () => import('../motion/tokens'));
vi.mock('$lib/motion/screenArrival', () => import('../motion/screenArrival'));
vi.mock('$lib/motion/outgoingScreen', () => ({ dropOutgoingScreens: vi.fn() }));
vi.mock('./scroll-region', () => ({ restoreScroll: vi.fn() }));
vi.mock('$lib/stores/ui.svelte', () => ({ ui: { tabMoving: false } }));

class Element {
  children: Element[] = [];
  isConnected = true;
  style = { setProperty: vi.fn(), removeProperty: vi.fn() };
  translate = 'none';
  classList = { add: vi.fn(), remove: vi.fn() };
  height = 100;
  bottom = 100;
  blind: Element | null = null;
  parts: Element[] = [];
  screen: Element | null = null;
  animations: { frames: Keyframe[]; options: KeyframeAnimationOptions; currentTime: number | null; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; finished: Promise<void>; finish: () => void }[] = [];
  getBoundingClientRect() { return { top: 0, bottom: this.bottom, height: this.height }; }
  closest() { return this.screen; }
  contains(child: Element) { return child === this || this.children.includes(child); }
  querySelector() { return this.blind; }
  querySelectorAll(selector: string) { return selector.includes('part') ? this.parts : []; }
  animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const animation = {
      frames, options, currentTime: null as number | null,
      pause: vi.fn(), play: vi.fn(), cancel: vi.fn(),
      finished, finish
    };
    this.animations.push(animation);
    return animation;
  }
}

let field: Element;
let screen: Element;
let frames: FrameRequestCallback[];

beforeEach(() => {
  finishAndroidTab();
  field = new Element();
  screen = new Element();
  field.screen = screen;
  field.blind = new Element();
  field.parts = [new Element()];
  screen.children = [field, new Element()];
  frames = [];
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('getComputedStyle', (element: Element) => ({ getPropertyValue: () => '', translate: element.translate }));
  vi.stubGlobal('document', {
    documentElement: { dataset: {} },
    querySelector: () => field
  });
});
afterEach(() => vi.unstubAllGlobals());

async function arrive() {
  await animateAndroidTab({
    to: { url: new URL('https://localhost/calendar') },
    complete: Promise.resolve()
  } as OnNavigate);
}
function paint() {
  const pending = frames.splice(0);
  pending.forEach((callback) => callback(0));
}
function animations() {
  return [...screen.children, ...field.parts]
    .flatMap((element) => element.animations);
}

it('holds the first positions through a paint before advancing any animation', async () => {
  await arrive();
  expect(animations().length).toBeGreaterThan(0);
  for (const animation of animations()) {
    expect(animation.pause).toHaveBeenCalledOnce();
    expect(animation.currentTime).toBe(0);
  }
  paint();
  expect(animations().every((animation) => animation.play.mock.calls.length === 0)).toBe(true);
  paint();
  expect(animations().every((animation) => animation.play.mock.calls.length === 1)).toBe(true);
});

it('carries the visible edge of an interrupted motion and moves its ink on the same curve', async () => {
  field.translate = '0px 50px';
  await arrive();
  const edge = field.animations[0];
  expect(edge.frames[0]).toEqual({ translate: '0 50px' });
  expect(field.style.setProperty).toHaveBeenCalledWith('--tab-bridge-height', '150px');
  expect(field.parts[0].animations.every((animation) => animation.frames.every((frame) => !('translate' in frame)))).toBe(true);
});

it('cancels preparation when another navigation removes the incoming screen', async () => {
  await arrive();
  screen.isConnected = false;
  paint();
  paint();
  expect(animations().every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  expect(animations().every((animation) => animation.play.mock.calls.length === 0)).toBe(true);
});

it('tracks the field motion until its animation finishes', async () => {
  await arrive();
  paint();
  paint();
  expect(ui.tabMoving).toBe(true);
  field.animations[0].finish();
  await vi.waitFor(() => expect(ui.tabMoving).toBe(false));
});

it('does not let an older field release a newer arrival', async () => {
  await arrive();
  const oldEdge = field.animations[0];
  await arrive();
  oldEdge.finish();
  await oldEdge.finished;
  await Promise.resolve();
  expect(ui.tabMoving).toBe(true);
  field.animations[1].finish();
  await vi.waitFor(() => expect(ui.tabMoving).toBe(false));
});

it('releases a superseded navigation before its destination mounts', async () => {
  let complete!: () => void;
  await animateAndroidTab({
    to: { url: new URL('https://localhost/calendar') },
    complete: new Promise<void>((resolve) => { complete = resolve; })
  } as OnNavigate);
  expect(ui.tabMoving).toBe(true);
  finishAndroidTab();
  complete();
  await Promise.resolve();
  expect(ui.tabMoving).toBe(false);
  expect(animations()).toHaveLength(0);
});
