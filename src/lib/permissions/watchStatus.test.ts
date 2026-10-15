/* The one way a screen keeps a permission status current (last-audit UI
   ticket 41). A grant made in Android's settings changes the answer while
   the app is in the background, so a screen that read once at mount kept
   saying "denied" after somebody had fixed it. */

import { describe, expect, it, vi } from 'vitest';
import { watchStatus, type VisiblePage } from './watchStatus';

type Status = 'granted' | 'denied';

/** A document stand-in: one listener list and a visibility the test sets. */
function fakePage() {
  const listeners = new Set<() => void>();
  const page: VisiblePage & { show(): void; hide(): void; listening(): number } = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_type: 'visibilitychange', listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'visibilitychange', listener: () => void) => {
      listeners.delete(listener);
    },
    show() {
      page.visibilityState = 'visible';
      for (const listener of [...listeners]) listener();
    },
    hide() {
      page.visibilityState = 'hidden';
      for (const listener of [...listeners]) listener();
    },
    listening: () => listeners.size
  };
  return page;
}

/** A read the test answers by hand, in whatever order it likes. */
function manualReads() {
  const pending: { resolve(value: Status): void; reject(error: Error): void }[] = [];
  const read = vi.fn(
    () =>
      new Promise<Status>((resolve, reject) => {
        pending.push({ resolve, reject });
      })
  );
  return { read, pending };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('watchStatus', () => {
  it('reads once on start and shows the answer', async () => {
    const page = fakePage();
    const seen: Status[] = [];
    const watch = watchStatus<Status>({ read: async () => 'denied', unreadable: 'denied', apply: (s) => seen.push(s), page });
    await settle();
    expect(seen).toEqual(['denied']);
    watch.stop();
  });

  it('reads again when the app comes back to the front, and not when it leaves', async () => {
    const page = fakePage();
    let answer: Status = 'denied';
    const seen: Status[] = [];
    const watch = watchStatus<Status>({ read: async () => answer, unreadable: 'denied', apply: (s) => seen.push(s), page });
    await settle();

    // Somebody opens Android's settings and grants it there.
    page.hide();
    await settle();
    expect(seen).toEqual(['denied']);
    answer = 'granted';
    page.show();
    await settle();
    expect(seen).toEqual(['denied', 'granted']);
    watch.stop();
  });

  it('shows a refused read as the unreadable status, never as the last granted answer', async () => {
    const page = fakePage();
    let fail = false;
    const seen: Status[] = [];
    const watch = watchStatus<Status>({
      read: async () => {
        if (fail) throw new Error('bridge refused');
        return 'granted';
      },
      unreadable: 'denied',
      apply: (s) => seen.push(s),
      page
    });
    await settle();
    fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    page.show();
    await settle();
    expect(seen).toEqual(['granted', 'denied']);
    watch.stop();
  });

  it('lets the newest read win when an older one answers last', async () => {
    const page = fakePage();
    const { read, pending } = manualReads();
    const seen: Status[] = [];
    const watch = watchStatus<Status>({ read, unreadable: 'denied', apply: (s) => seen.push(s), page });
    page.show();
    expect(read).toHaveBeenCalledTimes(2);

    // The read from before the trip to settings answers after the one from the return.
    pending[1].resolve('granted');
    await settle();
    pending[0].resolve('denied');
    await settle();
    expect(seen).toEqual(['granted']);
    watch.stop();
  });

  it('refresh() reads on demand, under the same newest-wins rule', async () => {
    const page = fakePage();
    let answer: Status = 'denied';
    const seen: Status[] = [];
    const watch = watchStatus<Status>({ read: async () => answer, unreadable: 'denied', apply: (s) => seen.push(s), page });
    await settle();
    answer = 'granted';
    await watch.refresh();
    expect(seen).toEqual(['denied', 'granted']);
    watch.stop();
  });

  it('stops listening on teardown and drops a read still in flight', async () => {
    const page = fakePage();
    const { read, pending } = manualReads();
    const seen: Status[] = [];
    const watch = watchStatus<Status>({ read, unreadable: 'denied', apply: (s) => seen.push(s), page });
    expect(page.listening()).toBe(1);
    watch.stop();
    expect(page.listening()).toBe(0);

    pending[0].resolve('granted');
    page.show();
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });
});
