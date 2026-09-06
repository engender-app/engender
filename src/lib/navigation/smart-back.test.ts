/* NAV-005: `smartBack` is the fix for Search and Day hardcoding where "back"
   goes, landing on a screen the user never visited. `goto` is mocked here
   because this Node tier has no SvelteKit alias configured for `$app/*` (it
   runs plain `.ts` modules, not routes) - the two branches below are the
   whole of the decision `smartBack` makes, so they are what a unit test can
   usefully isolate without a real browser. The end-to-end case - does the
   button actually land on the right screen in the running app - belongs to
   `tests/walkthrough.test.mjs`, which drives a real build.

   These tests used to stub `history.state['sveltekit:index']`, which is a
   key SvelteKit stopped writing: it stamps `sveltekit:history` and
   `sveltekit:navigation` timestamps now. So the module read `undefined` on
   every screen and took its fallback every time, and this file passed
   against a fiction it supplied itself (phase 5 UX ticket 25). The depth is
   the app's own count now, which is a thing the app controls and can
   therefore keep testing. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const goto = vi.fn();
vi.mock('$app/navigation', () => ({ goto }));

const { smartBack, recordNavigation, replaceRoute, navigationDepth } = await import('./smart-back.ts');

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

    expect(goto).toHaveBeenCalledWith('/calendar');
    expect(back).not.toHaveBeenCalled();
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
    expect(goto).toHaveBeenCalledWith('/calendar');
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

  it('does not deepen the history it replaced into', () => {
    /* The case that motivates this: a notification opens the app straight
       onto a screen, so the app sits on its boot entry with nothing behind
       it, and the screen then takes a query parameter back out of the URL.
       Counted as a push, the back control would believe there was somewhere
       to return to and walk out of the app instead of taking its fallback. */
    void replaceRoute('/wrapped/week');
    recordNavigation('goto');

    smartBack('/calendar');

    expect(goto).toHaveBeenCalledWith('/calendar');
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
