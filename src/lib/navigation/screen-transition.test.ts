import { describe, expect, it } from 'vitest';

import { screenTransition, type NavigationFacts } from './screen-transition';

const nav = (over: Partial<NavigationFacts> & { from: string | null; to: string }): NavigationFacts => ({
  type: 'link',
  isAndroid: false,
  isChromeless: false,
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
    expect(screenTransition(nav({ from: '/stats', to: '/timeline' }))).toBe('shared-axis');
    expect(screenTransition(nav({ from: '/more', to: '/settings/labs' }))).toBe('shared-axis');
  });

  it('reads a route that lights another tab as a tab change, not a detail', () => {
    /* /doses is reached from More's health group and lights that tab
       (active-tab.ts), so arriving from Stats crosses tabs even though
       neither path is a tab root. */
    expect(screenTransition(nav({ from: '/stats', to: '/doses' }))).toBe('fade-through');
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

  it('leaves back to Android, whose gesture has already started drawing it', () => {
    expect(
      screenTransition(
        nav({ from: '/day/20690', to: '/calendar', type: 'popstate', delta: -1, isAndroid: true })
      )
    ).toBe('none');
  });

  it('still animates forward on Android, which the gesture says nothing about', () => {
    expect(screenTransition(nav({ from: '/calendar', to: '/day/20690', isAndroid: true }))).toBe(
      'shared-axis'
    );
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
    expect(screenTransition(nav({ from: '/', to: '/entry/41' }))).toBe('container');
    expect(
      screenTransition(nav({ from: '/entry/41', to: '/day/20690', type: 'popstate', delta: -1 }))
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

  it('leaves the container transform to Android going back, like every other pattern', () => {
    /* The predictive back gesture has already started drawing where the
       person is going, and a fixed animation on top of it is worse than
       none. */
    expect(
      screenTransition(
        nav({ from: '/entry/41', to: '/day/20690', type: 'popstate', delta: -1, isAndroid: true })
      )
    ).toBe('none');
  });

  it('treats a forward popstate as forward', () => {
    expect(screenTransition(nav({ from: '/calendar', to: '/day/20690', type: 'popstate', delta: 1 }))).toBe(
      'shared-axis'
    );
  });
});
