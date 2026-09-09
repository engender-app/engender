import { describe, expect, it } from 'vitest';

import { dropOutgoingScreens } from './outgoingScreen';

/** A stand-in screen: removable, and able to say whether it sits inside
    another screen. */
function screen(nested = false) {
  const el = {
    removed: false,
    remove() {
      this.removed = true;
    },
    parentElement: { closest: () => (nested ? {} : null) }
  };
  return el;
}
/** A stand-in foot: removable, and carrying the mark its own
    out-transition writes when it starts leaving. */
function foot() {
  return {
    removed: false,
    remove() {
      this.removed = true;
    }
  };
}

/* Two queries now, so the stub answers by selector rather than handing the
   same list to both: the screens in the region, and the feet in the column
   that have begun to leave. */
const doc = (screens: ReturnType<typeof screen>[], feet: ReturnType<typeof foot>[] = []) =>
  ({
    querySelectorAll: (selector: string) => (selector.includes('savebar') ? feet : screens)
  }) as unknown as Document;

/* A screen alone still has to answer zero, which is the ordinary
   navigation: the stub above is what makes that a real reading rather than
   the same list counted twice. */

describe('the outgoing screen at the new capture', () => {
  it('leaves a lone screen alone', () => {
    const only = screen();
    expect(dropOutgoingScreens(doc([only]))).toBe(0);
    expect(only.removed).toBe(false);
  });

  /* The case this exists for: the outgoing page is still in the DOM
     finishing a zero-length outro, ahead of the incoming page in document
     order, and rendering is paused so it would stay there through the
     capture. */
  it('removes every screen but the last, which is the incoming one', () => {
    const outgoing = screen();
    const incoming = screen();
    expect(dropOutgoingScreens(doc([outgoing, incoming]))).toBe(1);
    expect(outgoing.removed).toBe(true);
    expect(incoming.removed).toBe(false);
  });

  /* The foot is in the app column rather than in the screen since carpet
     26, so a screen's remains are two nodes. A foot that has begun to leave
     is dead whether or not the screen being entered has one of its own,
     which is why this is read off the mark and not off document order. */
  it('removes every foot whose outro has begun, and asks for those only', () => {
    const leaving = foot();
    const asked: string[] = [];
    const watched = {
      querySelectorAll: (selector: string) => {
        asked.push(selector);
        return selector.includes('savebar') ? [leaving] : [screen()];
      }
    } as unknown as Document;
    expect(dropOutgoingScreens(watched)).toBe(1);
    expect(leaving.removed).toBe(true);
    /* The mark is what makes this safe on a screen with no foot of its own,
       where every foot in the column is a leftover and document order says
       nothing. Without it in the selector the query would hand back the
       arriving foot too. */
    expect(asked.find((s) => s.includes('savebar'))).toContain('[data-savebar-leaving]');
  });

  it('never counts a screen nested inside another as a page of its own', () => {
    const page = screen();
    const inner = screen(true);
    expect(dropOutgoingScreens(doc([page, inner]))).toBe(0);
    expect(page.removed).toBe(false);
    expect(inner.removed).toBe(false);
  });
});
