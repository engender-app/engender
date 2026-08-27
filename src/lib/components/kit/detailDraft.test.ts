import { describe, expect, it } from 'vitest';

import { draftFor, fillDecision, waitingOn } from './detailDraft.ts';

type Rec = { id: string; name: string };
type Draft = { name: string };

describe('fillDecision', () => {
  it('waits while the record behind the id is still on its way', () => {
    expect(fillDecision(null, 'a', true)).toBe('wait');
  });

  it('fills once the read has answered', () => {
    expect(fillDecision(null, 'a', false)).toBe('fill');
  });

  it('never fills the same id twice, so a re-run cannot discard what was typed', () => {
    expect(fillDecision('a', 'a', false)).toBe('keep');
  });

  it('keeps what was typed even while a later read for the same id is in flight', () => {
    expect(fillDecision('a', 'a', true)).toBe('keep');
  });

  /* The rule a plain `const id = page.params.id` cannot state: the route
     hands the same component a different record, and the draft on screen is
     still the previous one's. */
  it('fills again when the route moves to a different id', () => {
    expect(fillDecision('a', 'b', false)).toBe('fill');
    expect(fillDecision('a', 'b', true)).toBe('wait');
  });

  it('fills a new record without waiting for anything to answer', () => {
    expect(fillDecision(null, 'new', false)).toBe('fill');
  });
});

describe('draftFor', () => {
  const blank = (): Draft => ({ name: '' });
  const fromRecord = (r: Rec): Draft => ({ name: r.name });

  it('builds from the record when there is one', () => {
    expect(draftFor({ id: 'a', name: 'Alpha' }, blank, fromRecord)).toEqual({ name: 'Alpha' });
  });

  it('builds a blank draft when the id names no stored record', () => {
    expect(draftFor(undefined, blank, fromRecord)).toEqual({ name: '' });
  });
});

describe('waitingOn', () => {
  const answered = { rows: [], loading: false, empty: true, failed: false };

  /* The tryout entries race: the entries read has nothing to look up while
     the tryout itself is still loading, so it answers with nothing and the
     screen renders "no entries in this range" over a record that has not
     arrived. A read that hangs off the record is loading while the record
     is. */
  it('holds a dependent read at loading while the record is still loading', () => {
    expect(waitingOn(true, answered)).toEqual({ rows: [], loading: true, empty: false, failed: false });
  });

  it('reports the read itself once the record has arrived', () => {
    expect(waitingOn(false, answered)).toBe(answered);
  });

  it('keeps a failure visible rather than hiding it behind the wait', () => {
    expect(waitingOn(true, { ...answered, failed: true })).toEqual({
      rows: [],
      loading: true,
      empty: false,
      failed: true
    });
  });
});
