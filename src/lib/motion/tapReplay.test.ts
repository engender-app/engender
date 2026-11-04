import { describe, expect, it } from 'vitest';
import { holdTaps, TAP_SLOP } from './tapReplay';

/* A fake document: enough of addEventListener, elementFromPoint and the
   viewport for the replay to run against, and a target that counts clicks. */
function fakeDoc(href = 'http://app/settings') {
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  const clicks: string[] = [];
  const focused: string[] = [];
  const target = {
    closest: () => target,
    click: () => clicks.push('button'),
    focus: () => focused.push('button')
  };
  const doc = {
    documentElement: { clientWidth: 390, clientHeight: 844 },
    defaultView: { location: { href } },
    addEventListener(type: string, fn: (e: unknown) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      handlers.get(type)?.delete(fn);
    },
    elementFromPoint: () => target
  };
  const fire = (type: string, x: number, y: number, pointerId = 1) => {
    for (const fn of [...(handlers.get(type) ?? [])]) fn({ type, clientX: x, clientY: y, pointerId, isPrimary: true });
  };
  const tap = (x: number, y: number) => {
    fire('pointerdown', x, y);
    fire('pointerup', x, y);
  };
  const listening = () => [...handlers.values()].reduce((n, set) => n + set.size, 0);
  return { doc: doc as unknown as Document, fire, tap, clicks, focused, listening };
}

describe('tap replay after an appearance bloom', () => {
  it('replays a tap made during the bloom once, when it finishes', () => {
    const f = fakeDoc();
    const hold = holdTaps(f.doc);
    f.tap(200, 700);
    expect(f.clicks).toEqual([]);
    hold.finish();
    expect(f.clicks).toEqual(['button']);
    expect(f.focused).toEqual(['button']);
    expect(f.listening()).toBe(0);
  });

  it('keeps only the last of two taps', () => {
    const f = fakeDoc();
    let at: number[] = [];
    (f.doc as unknown as { elementFromPoint: (x: number, y: number) => unknown }).elementFromPoint = (x, y) => {
      at = [x, y];
      return { closest: () => ({ click: () => f.clicks.push('b'), focus() {} }) };
    };
    const hold = holdTaps(f.doc);
    f.tap(10, 10);
    f.tap(300, 400);
    hold.finish();
    expect(f.clicks).toEqual(['b']);
    expect(at).toEqual([300, 400]);
  });

  it('does not fire a tap made after the bloom finished', () => {
    const f = fakeDoc();
    const hold = holdTaps(f.doc);
    hold.finish();
    f.tap(200, 700);
    expect(f.clicks).toEqual([]);
  });

  it('treats a move beyond the slop as a drag, not a tap', () => {
    const f = fakeDoc();
    const hold = holdTaps(f.doc);
    f.fire('pointerdown', 200, 700);
    f.fire('pointermove', 200, 700 - TAP_SLOP - 1);
    f.fire('pointerup', 200, 700 - TAP_SLOP - 1);
    hold.finish();
    expect(f.clicks).toEqual([]);
  });

  it('finishes a tap whose finger lifts after the bloom ended', () => {
    const f = fakeDoc();
    const hold = holdTaps(f.doc);
    f.fire('pointerdown', 200, 700);
    hold.finish();
    expect(f.clicks).toEqual([]);
    f.fire('pointerup', 201, 701);
    expect(f.clicks).toEqual(['button']);
    expect(f.listening()).toBe(0);
  });

  it('drops the tap if the page navigated or the point left the window', () => {
    const moved = fakeDoc();
    const hold = holdTaps(moved.doc);
    moved.tap(200, 700);
    (moved.doc.defaultView as unknown as { location: { href: string } }).location.href = 'http://app/';
    hold.finish();
    expect(moved.clicks).toEqual([]);

    const outside = fakeDoc();
    const second = holdTaps(outside.doc);
    outside.tap(200, 700);
    (outside.doc.documentElement as unknown as { clientHeight: number }).clientHeight = 600;
    second.finish();
    expect(outside.clicks).toEqual([]);
  });

  it('dispatches a click event on something that is not a control', () => {
    const f = fakeDoc();
    const events: string[] = [];
    (f.doc as unknown as { elementFromPoint: () => unknown }).elementFromPoint = () => ({
      closest: () => null,
      dispatchEvent: (e: { type: string }) => events.push(e.type)
    });
    const hold = holdTaps(f.doc, (init) => ({ type: 'click', ...init }) as unknown as MouseEvent);
    f.tap(50, 60);
    hold.finish();
    expect(events).toEqual(['click']);
  });
});
