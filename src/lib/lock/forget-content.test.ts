/* What a lock takes out of the page besides the database and the key
   (after-release ticket 10; audit L09-02, L09-03 and SEC-08). */

import { afterEach, expect, it, vi } from 'vitest';
import { forgetJournalContent, forgetOnLock } from './forget-content.ts';
import { handOverQuery, holdSearch, takeHandedQuery, takeHeldSearch, EMPTY_SEARCH } from '../navigation/searchReturn.ts';
import { holdRoomAnswers, roomAnswersFor } from '../stores/inTheRoom.ts';
import { peaksFor } from '../media/peaks.ts';
import { lastResultCount, remember } from '../data/live/lastResults.ts';

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  });
}

afterEach(() => vi.unstubAllGlobals());

it('takes the held search, what was jotted in the room, the waveforms and the last answers', async () => {
  stubStorage();
  holdSearch({ ...EMPTY_SEARCH, query: 'name I chose', selectedTagIds: ['t1'], selectedMoods: [2] });
  handOverQuery('typed in More');
  holdRoomAnswers({ appointmentId: 'appt-1', answers: [{ question: 'Dose?', answer: 'raise it' }], byItemId: { i1: 'raise it' } });
  await peaksFor('memo.webm', async () => new Float32Array([0.5]));
  remember('home|entries.recentDays(5)', ['an entry'], [], 1, () => false);

  forgetJournalContent();

  expect(takeHeldSearch()).toBeNull();
  expect(takeHandedQuery()).toBeNull();
  expect(roomAnswersFor('appt-1')).toEqual([]);
  let decodedAgain = false;
  await peaksFor('memo.webm', async () => {
    decodedAgain = true;
    return new Float32Array([0.5]);
  });
  expect(decodedAgain).toBe(true);
  expect(lastResultCount()).toBe(0);
});

it('still forgets the rest where session storage refuses', () => {
  vi.stubGlobal('sessionStorage', {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  });
  holdRoomAnswers({ appointmentId: 'appt-2', answers: [{ question: 'Q', answer: 'A' }], byItemId: { i: 'A' } });
  expect(() => forgetJournalContent()).not.toThrow();
  expect(roomAnswersFor('appt-2')).toEqual([]);
});

it('runs what a holder registered, so the lock never has to import the holder', () => {
  stubStorage();
  let held: string | null = 'a held answer';
  forgetOnLock(() => {
    held = null;
  });
  forgetJournalContent();
  expect(held).toBeNull();
});

it('takes a search held before a reload, when nothing has loaded the search module yet', () => {
  stubStorage();
  sessionStorage.setItem('engender-search-return', JSON.stringify({ ...EMPTY_SEARCH, query: 'from before the reload' }));
  forgetJournalContent();
  expect(sessionStorage.getItem('engender-search-return')).toBeNull();
});
