import { describe, expect, it } from 'vitest';

import { shareField } from './sharedField';

/** A stand-in for the two things the primitive touches: a document that
    can be asked for the fields on it, and elements with a style. */
function fakeDocument(fields: { style: Record<string, string> }[]) {
  return {
    querySelectorAll: () => fields
  } as unknown as Document;
}
const field = () => ({ style: {} as Record<string, string> });

describe('the field as the shared element between doors', () => {
  it('names the field on the outgoing screen before the old side is captured', () => {
    const before = field();
    const carry = shareField(fakeDocument([before]));
    expect(carry).not.toBeNull();
    expect(before.style.viewTransitionName).toBe('field');
  });

  /* The whole reason this is script and not a stylesheet rule: after the
     navigation completes the outgoing screen is still in the DOM finishing
     its outros, so a rule naming every field named two, and the browser
     aborted the transition ("Unexpected duplicate view-transition-name")
     on three of the four door changes - which cut. Measured on the built
     app, 2026-09-08. The name has to be handed over. */
  it('hands the name from the outgoing field to the incoming one at the swap, never holding both', () => {
    const before = field();
    const doc = { fields: [before] };
    const carry = shareField({ querySelectorAll: () => doc.fields } as unknown as Document)!;
    const after = field();
    doc.fields = [before, after];
    carry.swap();
    expect(before.style.viewTransitionName).toBe('');
    expect(after.style.viewTransitionName).toBe('field');
  });

  it('gives the name back once the transition is over, so the field is not a stacking context for good', () => {
    const before = field();
    const after = field();
    const doc = { fields: [before] };
    const carry = shareField({ querySelectorAll: () => doc.fields } as unknown as Document)!;
    doc.fields = [before, after];
    carry.swap();
    carry.release();
    expect(before.style.viewTransitionName).toBe('');
    expect(after.style.viewTransitionName).toBe('');
  });

  it('does nothing on a screen with no field, and copes with an arrival that has none', () => {
    expect(shareField(fakeDocument([]))).toBeNull();
    const before = field();
    const doc = { fields: [before] };
    const carry = shareField({ querySelectorAll: () => doc.fields } as unknown as Document)!;
    doc.fields = [];
    carry.swap();
    expect(before.style.viewTransitionName).toBe('');
    carry.release();
  });
});
