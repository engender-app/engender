/* Check smartBack's history and fallback branches using the app's
   own depth. SvelteKit's history keys do not provide that count.
   Mock goto because the Node tier cannot resolve $app aliases.
   tests/walkthrough.test.mjs checks real app navigation. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const goto = vi.fn();
vi.mock('$app/navigation', () => ({ goto }));

const { smartBack, recordNavigation, replaceRoute, navigationDepth, depthAfter, sameUrl } = await import('./smart-back.ts');

let back: ReturnType<typeof vi.fn>;

beforeEach(() => {
  back = vi.fn();
  vi.stubGlobal('history', { back });
  recordNavigation('enter');
});

afterEach(() => {
  goto.mockClear();
  vi.unstubAllGlobals();
});

describe('smartBack', () => {
  it('falls back on the entry the app booted on - a deep link, or a reload', () => {
    smartBack('/calendar');

    expect(goto).toHaveBeenCalledWith('/calendar', { replaceState: true });
    expect(back).not.toHaveBeenCalled();
  });

  it('replaces on the way to the fallback, so back cannot bounce (CARPET-05)', () => {
    /* Pushed, the fallback would leave the screen it just backed out of
       one entry behind: deep link into a screen, press back to its parent,
       press back there and land on the deep-linked screen again, with no
       press that ever leaves. Replacing walks the parents up to Home
       instead - which is what Android's gesture already does when it runs
       out of history (platform-sync.ts). */
    smartBack('/settings');
    expect(goto).toHaveBeenCalledWith('/settings', { replaceState: true });

    recordNavigation('goto');
    smartBack('/more');

    expect(back).not.toHaveBeenCalled();
    expect(goto).toHaveBeenLastCalledWith('/more', { replaceState: true });
  });

  it('goes back through history once a navigation has happened inside the app', () => {
    recordNavigation('link');

    smartBack('/calendar');

    expect(back).toHaveBeenCalledOnce();
    expect(goto).not.toHaveBeenCalled();
  });

  it('counts a goto and a form the same as a link, because each pushes an entry', () => {
    recordNavigation('goto');
    smartBack('/calendar');
    expect(back).toHaveBeenCalledOnce();

    recordNavigation('enter');
    recordNavigation('form');
    smartBack('/calendar');
    expect(back).toHaveBeenCalledTimes(2);
    expect(goto).not.toHaveBeenCalled();
  });

  it('follows the delta back down when the system back button is used', () => {
    /* Two screens in, then back twice by the system: the second one lands on
       the entry the app booted on, and from there the fallback is the only
       thing to offer. */
    recordNavigation('link');
    recordNavigation('link');
    recordNavigation('popstate', -1);
    smartBack('/calendar');
    expect(back).toHaveBeenCalledOnce();

    recordNavigation('popstate', -1);
    smartBack('/calendar');
    expect(back).toHaveBeenCalledOnce();
    expect(goto).toHaveBeenCalledWith('/calendar', { replaceState: true });
  });

  it('counts a forward popstate back up', () => {
    recordNavigation('link');
    recordNavigation('popstate', -1);
    recordNavigation('popstate', 1);

    smartBack('/calendar');

    expect(back).toHaveBeenCalledOnce();
    expect(goto).not.toHaveBeenCalled();
  });

  it('reports the count the Android back handler decides on too', () => {
    expect(navigationDepth()).toBe(0);

    recordNavigation('link');
    expect(navigationDepth()).toBe(1);

    recordNavigation('popstate', -1);
    expect(navigationDepth()).toBe(0);
  });

  it('never goes below the boot entry, whatever deltas arrive', () => {
    /* A popstate that walks further back than the app has counted - the
       browser's history holds entries from before the app was opened - must
       not leave a negative depth that a later navigation could climb out of
       without ever pushing anything. */
    recordNavigation('popstate', -5);
    recordNavigation('link');

    smartBack('/calendar');

    expect(back).toHaveBeenCalledOnce();
  });
});

describe('replaceRoute', () => {
  it('replaces the current entry rather than pushing one', async () => {
    await replaceRoute('/wrapped/week');

    expect(goto).toHaveBeenCalledWith('/wrapped/week', { replaceState: true });
  });

  it('keeps the options the caller gave alongside the replacement', async () => {
    await replaceRoute('/compare', { noScroll: true, keepFocus: true });

    expect(goto).toHaveBeenCalledWith('/compare', { noScroll: true, keepFocus: true, replaceState: true });
  });

  /* `noScroll` holds the window, which the app does not scroll: the region
     has to be told as well, or the in-place swap opens it at the top.
     */
  it('holds the scroll region still for a noScroll replacement, and only then', async () => {
    const { claimScrollHold, restoreScroll } = await import('./scroll-region.ts');
    const el = { scrollTop: 500 };
    vi.stubGlobal('document', { querySelector: () => el });
    const to = new URL('http://localhost/compare?a=1');

    await replaceRoute('/compare?a=1', { noScroll: true, keepFocus: true });
    claimScrollHold(to);
    restoreScroll(to, 'goto');
    expect(el.scrollTop).toBe(500);

    await replaceRoute('/compare?a=1');
    claimScrollHold(to);
    restoreScroll(to, 'goto');
    expect(el.scrollTop).toBe(0);
  });

  it('does not deepen the history it replaced into', () => {
    /* The case that motivates this: a notification opens the app straight
       onto a screen, so the app sits on its boot entry with nothing behind
       it, and the screen then takes a query parameter back out of the URL.
       Counted as a push, the back control would believe there was somewhere
       to return to and walk out of the app instead of taking its fallback. */
    void replaceRoute('/wrapped/week');
    recordNavigation('goto');

    smartBack('/calendar');

    expect(goto).toHaveBeenCalledWith('/calendar', { replaceState: true });
    expect(back).not.toHaveBeenCalled();
  });

  it('spends the mark on one navigation, not on the next one too', () => {
    void replaceRoute('/wrapped/week');
    recordNavigation('goto');
    recordNavigation('link');

    smartBack('/calendar');

    expect(back).toHaveBeenCalledOnce();
  });
});

/* review: the tab a borrowing page lights is kept per history entry, keyed by the depth
   that entry sits at, so the shell has to know that depth before the navigation settles. */
describe('depthAfter', () => {
  it('answers what the settled navigation will record, without recording it', () => {
    recordNavigation('link');
    expect(depthAfter('link')).toBe(2);
    expect(depthAfter('popstate', -1)).toBe(0);
    expect(depthAfter('popstate', -5)).toBe(0);
    expect(navigationDepth()).toBe(1);
  });

  it('counts a replacing navigation as the same entry', () => {
    void replaceRoute('/wrapped/week');
    expect(depthAfter('goto')).toBe(0);
    recordNavigation('goto');
    expect(navigationDepth()).toBe(0);
  });
});

/* Fourth review: tapping the lit tab navigates to the address already
   showing, which SvelteKit turns into a replaceState. Counted as a push,
   every entry behind it was one deep too many, so Back from there looked up
   the wrong entry's borrowed tab. */
describe('a navigation to the same address', () => {
  it('adds no depth, like a replace', () => {
    recordNavigation('link');
    expect(depthAfter('link', null, true)).toBe(1);
    recordNavigation('link', null, true);
    expect(navigationDepth()).toBe(1);
  });

  it('still counts a same-address popstate by its delta', () => {
    recordNavigation('link');
    recordNavigation('link');
    expect(depthAfter('popstate', -1, true)).toBe(1);
  });
});

/* Fifth review: a goto() to the address already showing still pushes (the
   quick-add mood row reopening today's editor does it), so only a link or
   form counts as a same-address replace. A navigation can arrive with a
   null url, which must read as not-the-same rather than throw. */
describe('sameUrl', () => {
  const at = (href: string | null) => ({ url: href ? new URL(href) : null });
  it('is a link or form to the same address and nothing else', () => {
    expect(sameUrl({ type: 'link', from: at('http://x/calendar'), to: at('http://x/calendar') })).toBe(true);
    expect(sameUrl({ type: 'form', from: at('http://x/a'), to: at('http://x/a') })).toBe(true);
    expect(sameUrl({ type: 'goto', from: at('http://x/entry/1'), to: at('http://x/entry/1') })).toBe(false);
    expect(sameUrl({ type: 'link', from: at('http://x/a'), to: at('http://x/b') })).toBe(false);
    expect(sameUrl({ type: 'enter', from: null, to: at('http://x/a') })).toBe(false);
    expect(sameUrl({ type: 'link', from: at(null), to: at(null) })).toBe(false);
  });
});
