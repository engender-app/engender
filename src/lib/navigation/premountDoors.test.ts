import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let still = true;
vi.mock('$lib/stores/ui.svelte', () => ({ screenStill: () => still }));

import { premountDoors } from './premountDoors';

type Listener = (event: Event) => void;
let listeners: Map<string, Set<Listener>>;
let idle: ((deadline: IdleDeadline) => void)[];
let doc: { visibilityState: string; documentElement: { dataset: Record<string, string> } };

beforeEach(() => {
  vi.useFakeTimers();
  still = true;
  listeners = new Map();
  idle = [];
  doc = { visibilityState: 'visible', documentElement: { dataset: {} } };
  vi.stubGlobal('document', {
    get visibilityState() { return doc.visibilityState; },
    documentElement: doc.documentElement,
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => listeners.get(type)?.delete(listener)
  });
  vi.stubGlobal('requestIdleCallback', (callback: (deadline: IdleDeadline) => void) => idle.push(callback));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* Lets the waits run out and then the idle periods queued by then. */
function idlePeriods(count = 1) {
  for (let i = 0; i < count; i++) {
    vi.advanceTimersByTime(600);
    idle.splice(0).forEach((callback) => callback({ didTimeout: false, timeRemaining: () => 20 } as IdleDeadline));
  }
}
const fire = (type: string, event: object = {}) => listeners.get(type)?.forEach((listener) => listener({ type, ...event } as Event));

function doorsFrom(list: string[]) {
  const mounted: string[] = [];
  const next = () => list.find((door) => !mounted.includes(door)) ?? null;
  return { mounted, next, mount: (door: string) => mounted.push(door) };
}

describe('premountDoors', () => {
  it('mounts one door per idle period and stops, letting go of its listeners, when none is left', () => {
    const doors = doorsFrom(['/calendar', '/stats']);
    premountDoors(new AbortController().signal, doors.next, doors.mount);
    idlePeriods();
    expect(doors.mounted).toEqual(['/calendar']);
    idlePeriods();
    expect(doors.mounted).toEqual(['/calendar', '/stats']);
    idlePeriods();
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it('never mounts while a finger is down, and carries on once it lifts', () => {
    const doors = doorsFrom(['/calendar']);
    premountDoors(new AbortController().signal, doors.next, doors.mount);
    fire('pointerdown', { pointerId: 1 });
    idlePeriods(3);
    expect(doors.mounted).toEqual([]);
    fire('pointerup', { pointerId: 1 });
    idlePeriods();
    expect(doors.mounted).toEqual(['/calendar']);
  });

  it('waits while a screen is moving, the splash holds or the page is hidden', () => {
    const doors = doorsFrom(['/calendar']);
    premountDoors(new AbortController().signal, doors.next, doors.mount);
    still = false;
    idlePeriods(2);
    still = true;
    doc.documentElement.dataset.splash = '';
    idlePeriods(2);
    delete doc.documentElement.dataset.splash;
    doc.visibilityState = 'hidden';
    idlePeriods(2);
    expect(doors.mounted).toEqual([]);
    doc.visibilityState = 'visible';
    idlePeriods();
    expect(doors.mounted).toEqual(['/calendar']);
  });

  it('waits while a view transition is running', () => {
    const doors = doorsFrom(['/calendar']);
    premountDoors(new AbortController().signal, doors.next, doors.mount);
    doc.documentElement.dataset.nav = 'fade-through';
    idlePeriods(2);
    expect(doors.mounted).toEqual([]);
    delete doc.documentElement.dataset.nav;
    idlePeriods();
    expect(doors.mounted).toEqual(['/calendar']);
  });

  it('a scroll puts the next mount off rather than landing under it', () => {
    const doors = doorsFrom(['/calendar']);
    premountDoors(new AbortController().signal, doors.next, doors.mount);
    vi.advanceTimersByTime(600);
    fire('scroll');
    idle.splice(0).forEach((callback) => callback({ didTimeout: false, timeRemaining: () => 20 } as IdleDeadline));
    expect(doors.mounted).toEqual([]);
    idlePeriods();
    expect(doors.mounted).toEqual(['/calendar']);
  });

  it('stops for good when aborted', () => {
    const doors = doorsFrom(['/calendar']);
    const controller = new AbortController();
    premountDoors(controller.signal, doors.next, doors.mount);
    controller.abort();
    idlePeriods(3);
    expect(doors.mounted).toEqual([]);
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
});
