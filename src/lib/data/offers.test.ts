/* Every in-flow offer, and the one rule they all answer to (phase 8
   features ticket 22, ADR-0045).

   Two things worth saying about how this is written. Each entry's own
   `write` is driven here against a recording stub rather than a real
   journal, because what the ticket asks to be asserted per entry is that
   confirming writes exactly one record and declining writes none - which is
   a claim about the entry, not about `answerOffer`. Driving `answerOffer`
   with a fake write for all five would have restated the function and
   passed for an entry that writes on decline.

   And the completeness check is shown failing on a shortened registry
   rather than asserted to hold, the same discipline registry.test.ts keeps:
   a check parameterised over a widened list looks identical to one that
   works. */

import { describe, expect, it } from 'vitest';
import {
  OFFERS,
  OFFER_KEYS,
  answerOffer,
  openOffer,
  unregisteredOffers,
  type OfferJournal,
  type OfferKey
} from './offers.ts';

/** A journal that records what was asked of it and nothing else. Every
    method an offer's `write` may reach is here; anything an offer reaches
    that is not is a `TypeError` and a failing test, which is the point. */
function recordingJournal() {
  const calls: string[] = [];
  const journal = {
    milestones: {
      upsertMilestone: async () => {
        calls.push('milestones.upsertMilestone');
        return 'ms-1';
      }
    },
    procedures: {
      recordSurgeryMilestone: async () => {
        calls.push('procedures.recordSurgeryMilestone');
        return 'ms-2';
      }
    },
    tryouts: {
      adoptTryout: async (id: string) => {
        calls.push('tryouts.adoptTryout');
        return { tryoutId: id };
      }
    },
    feltSense: {
      add: async () => {
        calls.push('feltSense.add');
        return 'fs-1';
      }
    }
  } as unknown as OfferJournal;
  return { journal, calls };
}

/** One subject per offer, in the shape that offer's own trigger produces.
    A table rather than a loop over the registry, because a subject is the
    one thing that genuinely differs per entry - and because a generic
    placeholder would let an entry that ignores its subject pass. */
const SUBJECTS: { [K in OfferKey]: Parameters<(typeof OFFERS)[K]['write']>[1] } = {
  'roadmap-goal-milestone': {
    title: 'Legal name change',
    epochDay: 20000,
    photo: null,
    goalKey: 'pl-legal-name-usc'
  },
  'surgery-day-milestone': { procedureId: 'proc-1' },
  'tryout-adoption-milestone': {
    tryoutId: 'try-1',
    endEpochDay: 20000,
    createMilestone: true,
    milestoneTitle: 'Ada',
    milestoneEpochDay: 20000
  },
  'new-milestone-felt-sense': {
    owner: { milestoneId: 'ms-1' },
    epochDay: 20000,
    mood: 4,
    note: null
  },
  'milestone-anniversary-felt-sense': {
    owner: { milestoneId: 'ms-1' },
    epochDay: 20000,
    mood: 4,
    note: 'a year on'
  }
};

describe('the in-flow offer registry', () => {
  it('holds one entry per offer, keyed by the offer', () => {
    expect(Object.keys(OFFERS).sort()).toEqual([...OFFER_KEYS].sort());
  });

  it('says what every offer is about, and what it writes', () => {
    for (const key of OFFER_KEYS) {
      const offer = OFFERS[key];
      expect(offer.trigger, key).toBeTruthy();
      expect(offer.offers, key).toBeTruthy();
      expect(offer.copy.title(), key).toBeTruthy();
      expect(offer.copy.confirm(), key).toBeTruthy();
      expect(offer.copy.decline(), key).toBeTruthy();
    }
  });

  it('the completeness check can fail: a shortened registry names exactly the offer it is missing', () => {
    const shortened = OFFER_KEYS.filter((key) => key !== 'surgery-day-milestone').map((key) => OFFERS[key]);
    expect(unregisteredOffers(shortened)).toEqual(['surgery-day-milestone']);
  });
});

describe('the confirmation rule (ADR-0045)', () => {
  it('writes nothing when the offer is declined, for every offer', async () => {
    for (const key of OFFER_KEYS) {
      const { journal, calls } = recordingJournal();
      const written = await answerOffer(OFFERS[key], SUBJECTS[key], 'decline', journal);

      expect(written, key).toBe(false);
      expect(calls, key).toEqual([]);
    }
  });

  it('writes exactly one record when the offer is confirmed, for every offer', async () => {
    for (const key of OFFER_KEYS) {
      const { journal, calls } = recordingJournal();
      const written = await answerOffer(OFFERS[key], SUBJECTS[key], 'confirm', journal);

      expect(written, key).toBe(true);
      expect(calls.length, key).toBe(1);
    }
  });

  it('writes nothing when there is no open offer to answer', async () => {
    /* A confirm that arrives after the sheet closed - a double tap, or a
       stale handler - has no subject, and an offer with no subject has
       nothing anybody agreed to. */
    const { journal, calls } = recordingJournal();
    const written = await answerOffer(OFFERS['surgery-day-milestone'], null, 'confirm', journal);

    expect(written).toBe(false);
    expect(calls).toEqual([]);
  });

  it('does not open a second time once the source holds the record it mints', () => {
    /* ADR-0045's own consequence: "each confirmed link is recorded ... so
       the same source doesn't offer to mint twice". Checking and unchecking
       a roadmap goal is the trigger the ADR names, and before this it
       re-offered and minted a duplicate every time. */
    const subject = { key: 'pl-legal-name-usc', title: 'Legal name change' };

    expect(openOffer(subject, null)).toEqual(subject);
    expect(openOffer(subject, 'ms-1')).toBe(null);
  });
});
