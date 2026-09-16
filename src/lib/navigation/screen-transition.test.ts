import { describe, expect, it } from 'vitest';

import { screenTransition, type NavigationFacts } from './screen-transition';
import { chromelessPath, replacesAppNavigation } from './chromeless';

const nav = (over: Partial<NavigationFacts> & { from: string | null; to: string }): NavigationFacts => ({
  type: 'link',
  isChromeless: false,
  fromSheet: false,
  chromeOrigin: '',
  ...over
});

describe('choosing a tier-2 pattern', () => {
  it('fades through between the four tabs, because they are peers', () => {
    expect(screenTransition(nav({ from: '/', to: '/calendar' }))).toBe('fade-through');
    expect(screenTransition(nav({ from: '/calendar', to: '/stats' }))).toBe('fade-through');
    expect(screenTransition(nav({ from: '/stats', to: '/more' }))).toBe('fade-through');
    expect(screenTransition(nav({ from: '/more', to: '/' }))).toBe('fade-through');
  });

  it('shares an axis going deeper inside one tab, because that is a sequence', () => {
    expect(screenTransition(nav({ from: '/calendar', to: '/day/20690' }))).toBe('shared-axis');
    expect(screenTransition(nav({ from: '/stats', to: '/body-map' }))).toBe('shared-axis');
    expect(screenTransition(nav({ from: '/more', to: '/care/labs' }))).toBe('shared-axis');
    // /settings borrows a tab rather than owning one (audit item 4); /more
    // already lit 'settings' a moment ago, which is what chromeOrigin
    // carries into a screen reached from it.
    expect(screenTransition(nav({ from: '/more', to: '/settings', chromeOrigin: 'settings' }))).toBe(
      'shared-axis'
    );
  });

  it('reads a route that lights another tab as a tab change, not a detail', () => {
    /* /care/doses is reached from More's health group and lights that tab
       (active-tab.ts), so arriving from Stats crosses tabs even though
       neither path is a tab root. */
    expect(screenTransition(nav({ from: '/stats', to: '/care/doses' }))).toBe('fade-through');
  });

  it('steps into the return moment and back out of it (ticket 35)', () => {
    /* Chromeless is about the bar; it must not also mean "no movement".
       /coming-back lights the Today tab (active-tab.ts), so arriving from
       Home is going deeper inside one tab - which is what carries the
       field's blind down from the sun's height to the step's. */
    expect(screenTransition(nav({ from: '/', to: '/coming-back' }))).toBe('shared-axis');
    expect(
      screenTransition(nav({ from: '/coming-back', to: '/', type: 'popstate', delta: -1 }))
    ).toBe('shared-axis-back');
  });

  it('reverses the axis on the way back', () => {
    expect(screenTransition(nav({ from: '/day/20690', to: '/calendar', type: 'popstate', delta: -1 }))).toBe(
      'shared-axis-back'
    );
  });

  it('counts a back control that is an ordinary link as going back', () => {
    /* ScreenHeader's arrow is an <a href> to a fixed parent, so it arrives
       as a forward navigation. Without this the arrow would slide the wrong
       way on nearly every screen in the app. */
    expect(screenTransition(nav({ from: '/settings/labs', to: '/settings' }))).toBe('shared-axis-back');
    expect(screenTransition(nav({ from: '/search/starred', to: '/search' }))).toBe('shared-axis-back');
  });

  it('does not read reaching Home as a step up out of a tab', () => {
    /* Every path starts with "/", so a naive prefix test would call every
       navigation to Home a back. It is a tab change. */
    expect(screenTransition(nav({ from: '/settings/labs', to: '/' }))).toBe('fade-through');
  });

  it('does not mistake a sibling whose name starts the same way', () => {
    expect(screenTransition(nav({ from: '/settings/labsomething', to: '/settings/labs' }))).toBe(
      'shared-axis'
    );
  });

  it('animates back within a tab as shared-axis-back, avoiding abrupt cuts (ticket 102)', () => {
    expect(
      screenTransition(
        nav({ from: '/day/20690', to: '/calendar', type: 'popstate', delta: -1 })
      )
    ).toBe('shared-axis-back');
    expect(
      screenTransition(
        nav({ from: '/settings/tags', to: '/settings', type: 'popstate', delta: -1 })
      )
    ).toBe('shared-axis-back');
  });

  it('animates nothing on a cold start, on a gate, or in place', () => {
    expect(screenTransition(nav({ from: null, to: '/calendar' }))).toBe('none');
    expect(screenTransition(nav({ from: '/', to: '/onboarding', isChromeless: true }))).toBe('none');
    expect(screenTransition(nav({ from: '/stats', to: '/stats' }))).toBe('none');
  });

  it('grows the tapped entry into the editor, and shrinks it back', () => {
    /* The one container transform in the app (DIRECTION.md tier 2): the
       entry card really does become the editor. Ticket 18 wired the other
       three patterns and left this one, because it is the only one that
       needs the two surfaces to agree on a key rather than only the
       navigation. */
    expect(screenTransition(nav({ from: '/calendar', to: '/entry/41' }))).toBe('container');
    expect(screenTransition(nav({ from: '/day/20690', to: '/entry/41' }))).toBe('container');
    expect(screenTransition(nav({ from: '/search', to: '/entry/41' }))).toBe('container');
    expect(
      screenTransition(nav({ from: '/entry/41', to: '/day/20690', type: 'popstate', delta: -1 }))
    ).toBe('container');
    /* A day card is a container; Home's rows are not (item 23, below). */
  });

  it('fades Home into an entry like a tab crossing, both ways', () => {
    /* Item 23: from Home an entry opens as a peer crossing, not a box
       growing - the same fade-through a tab switch gets. Back out of it the
       tab rule already fades too, because /entry lights the calendar tab
       and / is no tab's step, so the pair stays symmetric without this
       table saying so twice. */
    expect(screenTransition(nav({ from: '/', to: '/entry/41' }))).toBe('fade-through');
    expect(screenTransition(nav({ from: '/entry/41', to: '/', type: 'popstate', delta: -1 }))).toBe(
      'fade-through'
    );
  });

  it('fades an entry open out of a sheet, because a modal is not a container', () => {
    /* Why, in screen-transition.ts beside the branch. What is pinned here
       is the pair the reasoning turns on: a sheet is carved out, and the
       same screen with nothing open over it is not. */
    expect(screenTransition(nav({ from: '/stats', to: '/entry/41', fromSheet: true }))).toBe(
      'fade-through'
    );
    /* And the same screen with nothing open over it is still a container:
       the carve-out is the sheet, not /stats. */
    expect(screenTransition(nav({ from: '/stats', to: '/entry/41' }))).toBe('container');
  });

  it('leaves the way back out of an entry to the table it already had', () => {
    /* Deliberately not carved out, unlike /doubt's return leg. That one had
       to be, because a nameless `container` there would have been a plain
       crossfade over the transform's own --dur-slow. This one is not: only
       the named entry-open group takes --dur-slow, and the forward leg
       above having answered fade-through means the layout dropped the
       container name, so nothing on the way back is named at all. What is
       left is the screen pair, which crossfades on the same --dur-fast out
       and --dur-med in a fade-through uses. */
    expect(
      screenTransition(nav({ from: '/entry/41', to: '/stats', type: 'popstate', delta: -1 }))
    ).toBe('container');
  });

  it('opens an entry from the counterevidence screen on the axis, both ways', () => {
    /* The one screen carved out of the transform (Alicja, 2026-08-26). It
       is a correct source by the rule - it draws entry cards and they link
       into the editor - and she read the transform out of it as far too
       big a movement for what it is: a list of past good days, where an
       entry is evidence being cited rather than a thing being opened.

       Both legs, because a pattern that only carves out the way in leaves
       the way back a slow crossfade over the transform's own duration,
       which is the same complaint arriving late. */
    expect(screenTransition(nav({ from: '/doubt', to: '/entry/41' }))).toBe('shared-axis');
    expect(
      screenTransition(nav({ from: '/entry/41', to: '/doubt', type: 'popstate', delta: -1 }))
    ).toBe('shared-axis-back');
  });

  it('opens a new entry on the shared axis, because nothing was tapped to become it', () => {
    /* A container transform needs a container. Quick add's fan, the day
       screen's add button and a launcher shortcut all open the editor with
       no card behind them, so /entry/new keeps the axis it has. */
    expect(screenTransition(nav({ from: '/day/20690', to: '/entry/new/20690' }))).toBe('shared-axis');
    expect(screenTransition(nav({ from: '/', to: '/entry/new/today?seedMood=4' }))).toBe(
      'fade-through'
    );
  });

  it('animates the container transform going back (ticket 102)', () => {
    expect(
      screenTransition(
        nav({ from: '/entry/41', to: '/day/20690', type: 'popstate', delta: -1 })
      )
    ).toBe('container');
  });

  it('treats a forward popstate as forward', () => {
    expect(screenTransition(nav({ from: '/calendar', to: '/day/20690', type: 'popstate', delta: 1 }))).toBe(
      'shared-axis'
    );
  });
});

describe('the blind runs on every navigation the app makes (ADR-0080)', () => {
  /* The cut list is closed. Anything not on it moves, and a route having no
     chrome is not on it - that conflation is what made ticket 35's arrival
     a yank. */
  it('cuts only with nothing to come from', () => {
    expect(screenTransition(nav({ from: null, to: '/' }))).toBe('none');
  });

  it('cuts when either side renders instead of the app', () => {
    expect(screenTransition(nav({ from: '/', to: '/onboarding', isChromeless: true }))).toBe('none');
    expect(screenTransition(nav({ from: '/onboarding', to: '/', isChromeless: true }))).toBe('none');
  });

  it('cuts on the same path, and between views of one screen', () => {
    expect(screenTransition(nav({ from: '/stats', to: '/stats' }))).toBe('none');
    expect(screenTransition(nav({ from: '/wrapped/year', to: '/wrapped/month' }))).toBe('none');
  });

  it('moves for a chromeless route the app navigated to', () => {
    /* The invariant, stated over the predicates rather than over one route:
       a path with no chrome that does not replace the app is a path the
       transition must animate. `isChromeless` is the *narrower* fact, which
       is what the layout now feeds it. */
    for (const path of ['/coming-back']) {
      expect(chromelessPath(path), path).toBe(true);
      expect(replacesAppNavigation(path), path).toBe(false);
      expect(
        screenTransition(nav({ from: '/', to: path, isChromeless: replacesAppNavigation(path) })),
        path
      ).not.toBe('none');
      expect(
        screenTransition(
          nav({ from: path, to: '/', type: 'popstate', delta: -1, isChromeless: replacesAppNavigation(path) })
        ),
        path
      ).not.toBe('none');
    }
  });
});
