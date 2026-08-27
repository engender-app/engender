import { describe, expect, it } from 'vitest';

import { answersFor, draftFor, fillDecision } from './detailDraft.ts';

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

describe('answersFor', () => {
  /* The tryout entries race: the entries read has nothing to look up while
     the tryout itself is still loading, so it answers with nothing - and a
     live query keeps that answer on screen through the re-run the record
     triggers. Rendered as-is it is "no entries in this range" over a record
     that does have some. */
  it('refuses an answer read before there was a record to read for', () => {
    expect(answersFor({ for: null, value: undefined }, 'a')).toBe(false);
  });

  it('refuses an answer read for a different id', () => {
    expect(answersFor({ for: 'a', value: [] }, 'b')).toBe(false);
  });

  it('refuses a read that has not answered at all', () => {
    expect(answersFor(undefined, 'a')).toBe(false);
  });

  it('takes an answer read for this id, empty or not', () => {
    expect(answersFor({ for: 'a', value: [] }, 'a')).toBe(true);
    expect(answersFor({ for: 'a', value: [1] }, 'a')).toBe(true);
  });

  /* An id that names nothing stored still gets an answer: the read ran, it
     had no record, and an empty state is the right thing to show. What must
     never happen is a placeholder held forever. */
  it('takes an answer read for this id even when the id names nothing', () => {
    expect(answersFor({ for: 'gone', value: undefined }, 'gone')).toBe(true);
  });
});
