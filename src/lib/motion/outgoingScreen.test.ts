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
const doc = (screens: ReturnType<typeof screen>[]) =>
  ({ querySelectorAll: () => screens }) as unknown as Document;

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

  it('never counts a screen nested inside another as a page of its own', () => {
    const page = screen();
    const inner = screen(true);
    expect(dropOutgoingScreens(doc([page, inner]))).toBe(0);
    expect(page.removed).toBe(false);
    expect(inner.removed).toBe(false);
  });
});
