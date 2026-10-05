/* Lock timing at the seam watchLock() hands its leave events to
   (lock-timing ticket 01), with a fake clock and a fake document, since the
   node tier has neither a page to hide nor a minute to wait. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from 'vitest';
import type { LockAfter } from '../data/prefs/catalogue.ts';
import { watchLeave } from './leave-lock.ts';

function harness(lockAfter: LockAfter, { android = false } = {}) {
  let clock = 1_000_000;
  let locks = 0;
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const timing = { value: lockAfter };
  const native: { __lockOnLeaveFromNative?: (ownScreen?: boolean) => void; __lockOnReturnFromNative?: () => void } = {};
  const stop = watchLeave({
    page,
    native: android ? native : undefined,
    lockAfter: () => timing.value,
    lock: () => void locks++,
    now: () => clock
  });
  const show = (state: DocumentVisibilityState) => {
    page.visibilityState = state;
    page.dispatchEvent(new Event('visibilitychange'));
  };
  return {
    timing,
    stop,
    locks: () => locks,
    hide: () => show('hidden'),
    reveal: () => show('visible'),
    nativeLeave: () => native.__lockOnLeaveFromNative?.(),
    ownScreenLeave: () => native.__lockOnLeaveFromNative?.(true),
    nativeReturn: () => native.__lockOnReturnFromNative?.(),
    wait: (ms: number) => void (clock += ms),
    setClock: (ms: number) => void (clock = ms)
  };
}

test('immediately locks the moment the page is hidden, before anything comes back', () => {
  const app = harness('immediately');
  app.hide();
  expect(app.locks()).toBe(1);
});

test('native Recents counts an absence while the document stays visible', () => {
  const app = harness('one-minute', { android: true });
  app.nativeLeave();
  app.wait(59_000);
  app.nativeReturn();
  expect(app.locks()).toBe(0);
  app.nativeLeave();
  app.wait(61_000);
  expect(app.locks()).toBe(0);
  app.nativeReturn();
  expect(app.locks()).toBe(1);
});

test('native Recents follows Immediately, five minutes and restart', () => {
  const immediate = harness('immediately', { android: true });
  immediate.nativeLeave();
  expect(immediate.locks()).toBe(1);
  for (const timing of ['five-minutes', 'restart'] as const) {
    const app = harness(timing, { android: true });
    app.nativeLeave();
    app.wait(301_000);
    app.nativeReturn();
    expect(app.locks()).toBe(timing === 'restart' ? 0 : 1);
  }
});

test('on Android a hidden page is not a leave: the activity says when the app left', () => {
  /* A picker, the camera and a permission dialog all cover the WebView and
     hide the page without the person leaving the app. Only the activity can
     tell those apart from Home or Recents (MainActivity's own-system-UI
     window), so on Android the page's visibility decides nothing. */
  const app = harness('immediately', { android: true });
  app.hide();
  app.reveal();
  expect(app.locks()).toBe(0);
  app.nativeLeave();
  expect(app.locks()).toBe(1);
});

test('under immediately, a screen the app opened itself is a minute of grace, not a lock', () => {
  /* A photo picker, the camera, a folder picker or a permission dialog. The
     activity cannot see Home or Recents pressed on a screen it does not own,
     so the time spent there still counts: a picker left open for longer
     than a minute is treated as the person having gone. */
  const app = harness('immediately', { android: true });
  app.ownScreenLeave();
  expect(app.locks()).toBe(0);
  app.wait(59_000);
  app.nativeReturn();
  expect(app.locks()).toBe(0);
  app.ownScreenLeave();
  app.wait(61_000);
  app.nativeReturn();
  expect(app.locks()).toBe(1);
});

test('a real leave from inside one of the app\'s own screens still locks at once', () => {
  /* The screen going off while a picker is up reaches the activity, and is
     leaving whatever is on top. */
  const app = harness('immediately', { android: true });
  app.ownScreenLeave();
  app.nativeLeave();
  expect(app.locks()).toBe(1);
});

test('the timed choices count time on the app\'s own screens like any other absence', () => {
  const app = harness('five-minutes', { android: true });
  app.ownScreenLeave();
  app.wait(4 * 60_000);
  app.nativeReturn();
  expect(app.locks()).toBe(0);
  app.ownScreenLeave();
  app.wait(5 * 60_000 + 1_000);
  app.nativeReturn();
  expect(app.locks()).toBe(1);
});

test('the grace ends with the return, so the next leave is judged on its own', () => {
  const app = harness('immediately', { android: true });
  app.ownScreenLeave();
  app.nativeReturn();
  app.nativeLeave();
  expect(app.locks()).toBe(1);
});

test('stopping removes native leave and return hooks', () => {
  const app = harness('immediately', { android: true });
  app.stop();
  app.nativeLeave();
  expect(app.locks()).toBe(0);
});

test('after a minute, 59 seconds away does not lock', () => {
  const app = harness('one-minute');
  app.hide();
  app.wait(59_000);
  app.reveal();
  expect(app.locks()).toBe(0);
});

test('after a minute, 61 seconds away locks on the way back, not while hidden', () => {
  const app = harness('one-minute');
  app.hide();
  app.wait(61_000);
  expect(app.locks()).toBe(0);
  app.reveal();
  expect(app.locks()).toBe(1);
});

test('after five minutes counts five minutes, not one', () => {
  const app = harness('five-minutes');
  app.hide();
  app.wait(4 * 60_000);
  app.reveal();
  expect(app.locks()).toBe(0);
  app.hide();
  app.wait(5 * 60_000 + 1_000);
  app.reveal();
  expect(app.locks()).toBe(1);
});

test('only on a restart never locks mid-session, however long it was away', () => {
  const app = harness('restart');
  app.hide();
  app.wait(24 * 60 * 60_000);
  app.reveal();
  expect(app.locks()).toBe(0);
});

test('each absence is counted on its own, so short trips do not add up', () => {
  const app = harness('one-minute');
  for (let trip = 0; trip < 3; trip++) {
    app.hide();
    app.wait(40_000);
    app.reveal();
  }
  expect(app.locks()).toBe(0);
});

test('the timing is read on the way back, so a change made elsewhere applies at once', () => {
  const app = harness('restart');
  app.hide();
  app.wait(90_000);
  app.timing.value = 'one-minute';
  app.reveal();
  expect(app.locks()).toBe(1);
});

test('a clock turned back while away counts as too long rather than no time at all', () => {
  /* Wall-clock rather than a monotonic one because a suspended WebView's
     monotonic clock can stop with the device, and the check on return is
     the only one there is. The price is a clock that can be moved, and
     moving it back must not be a way to skip the lock. */
  const app = harness('five-minutes');
  app.hide();
  app.setClock(0);
  app.reveal();
  expect(app.locks()).toBe(1);
});

test('a return with no absence recorded does not lock', () => {
  const app = harness('one-minute');
  app.reveal();
  expect(app.locks()).toBe(0);
});

test('stopping removes the listener', () => {
  const app = harness('immediately');
  app.stop();
  app.hide();
  expect(app.locks()).toBe(0);
});

test('focus leaving a still-visible window is not a leave: watchLock has no blur listener', () => {
  /* The desktop half of the acceptance: clicking another window beside the
     diary used to lock it. visibilitychange does not fire for that, so the
     whole guarantee is that nothing listens for focus loss any more. A
     source read, because the node tier cannot mount the Svelte store that
     owns the listeners. */
  const source = readFileSync(fileURLToPath(new URL('../stores/lock.svelte.ts', import.meta.url)), 'utf8');
  expect(source).not.toMatch(/['"]blur['"]/);
  expect(source).not.toMatch(/['"]focusout['"]/);
});
