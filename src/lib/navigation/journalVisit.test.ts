import { describe, expect, it } from 'vitest';
import { forgetJournalContent } from '../lock/forget-content';
import { rememberJournalVisit, restoreJournalVisit } from './journalVisit';

describe('Journal history visits', () => {
  const july = { year: 2026, month: 6, recentDaysLimit: 15 };
  const june = { year: 2026, month: 5, recentDaysLimit: 10 };

  it('keeps separate visits and restores only history arrivals', () => {
    rememberJournalVisit(1, july);
    rememberJournalVisit(3, june);
    expect(restoreJournalVisit(1, true)).toEqual(july);
    expect(restoreJournalVisit(3, true)).toEqual(june);
    expect(restoreJournalVisit(1, false)).toBeNull();
    expect(restoreJournalVisit(1, true)).toBeNull();
  });

  it('forgets every visit when the journal locks', () => {
    rememberJournalVisit(1, july);
    rememberJournalVisit(3, june);
    forgetJournalContent();
    expect(restoreJournalVisit(1, true)).toBeNull();
    expect(restoreJournalVisit(3, true)).toBeNull();
  });
});
