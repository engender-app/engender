/* Every in-flow offer, and the one rule they all answer to (phase 8
   features ticket 22, ADR-0045).

   Two things worth saying about how this is written. Each entry's own
   `write` is driven here against a recording stub rather than a real
   journal, because what the ticket asks to be asserted per entry is that
   confirming writes exactly one record and declining writes none - which is
   a claim about the entry, not about `answerOffer`. Driving `answerOffer`
   with a fake write for all five would have restated the function and
   passed for an entry that writes on decline.

   And there is no completeness test here on purpose. `OFFERS` is a total
   `Record` over `OfferKey`, so an unregistered offer is a missing property
   refused at the `satisfies` line - shown to fail by deleting the surgery
   entry and watching svelte-check refuse it. A runtime mirror derived from
   `OFFERS` could only fail on a copy a test shortened by hand, which is a
   check of `filter` wearing the registry's name; offers.ts's own header
   sets that against `unprompted/registry.ts`, where the array shape makes
   the runtime half worth having. */

import { describe, expect, it } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import {
  OFFERS,
  OFFER_KEYS,
  answerOffer,
  milestoneMintedByGoal,
  type OfferJournal,
  type OfferKey
} from './offers.ts';

/** A journal that records what was asked of it and nothing else. Every
    method an offer's `write` may reach is here; anything an offer reaches
    that is not is a `TypeError` and a failing test, which is the point. */
function recordingJournal() {
  const calls: string[] = [];
  /** What a wear session was closed with, so the one offer that turns an
      answer into a figure can be checked on the figure rather than only on
      having written. */
  const durations: (number | null)[] = [];
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
    },
    areaStates: {
      setAreasFinished: async () => {
        calls.push('areaStates.setAreasFinished');
      },
      setAreasSuspended: async () => {
        calls.push('areaStates.setAreasSuspended');
      }
    },
    doses: {
      upsertDose: async () => {
        calls.push('doses.upsertDose');
        return 'dose-1';
      }
    },
    wearSessions: {
      upsertSession: async (input: { durationMs: number | null }) => {
        calls.push('wearSessions.upsertSession');
        durations.push(input.durationMs);
        return 'wear-1';
      }
    }
  } as unknown as OfferJournal;
  return { journal, calls, durations };
}

const START_OF_DAY = startOfDayTimestamp(20000);

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
  },
  /* Two areas, because the one hub row that fronts two finishes both in the
     same call and a subject naming one would let a half-finished row
     through. */
  'area-finished': { areas: ['hairStages', 'hairPhotos'], epochDay: 20000 },
  /* Two areas, the same reason: `voice` is the other group fronting more
     than one section, and the only other suspendable one besides
     hair removal (SUSPENDABLE_AREAS, areaState.ts). */
  'area-suspended': { areas: ['voiceBenchmarks', 'voicePracticeTakes'], epochDay: 20000 },
  /* Phase 8 features ticket 05. An oral dose, which is the one arm of
     `DoseEventInput` that needs no site - the sheet collects a site for
     every other route, and a subject here that skipped one would not
     compile. */
  'returning-dose': {
    route: 'oral',
    timestamp: START_OF_DAY,
    dose: 4,
    doseUnit: 'mg',
    drug: 'estradiol valerate'
  },
  'returning-wear-session': { sessionId: 'wear-1', startTimestamp: START_OF_DAY, endEpochDay: 20002 }
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

  it('names itself the same way twice, so a screen cannot address the wrong entry', () => {
    /* The completeness check itself is the `satisfies` line in offers.ts,
       which is compile-time and shown to fail by deleting an entry - there
       is no runtime half to test here, and the module header says why a
       derived one would only ever be a test of `filter`. What a runtime
       test can still add is that no entry's `key` disagrees with the
       property it is filed under. */
    for (const key of OFFER_KEYS) expect(OFFERS[key].key, key).toBe(key);
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

  it('closes a wear session at the end of the day it was told, never at the start', async () => {
    /* The one offer whose confirmation is arithmetic rather than a
       hand-off. A timer left running has no honest end time in it, so the
       person names a day and the write turns that into a duration - and
       which end of that day it takes is the whole difference between a
       session that lasted two days and one that lasted three. The sheet
       says out loud that it runs to the end of the day; this is what holds
       it to that. */
    const { journal, durations } = recordingJournal();
    await answerOffer(OFFERS['returning-wear-session'], SUBJECTS['returning-wear-session'], 'confirm', journal);

    expect(durations).toEqual([startOfDayTimestamp(20003) - START_OF_DAY]);
  });

  it('finds the milestone a roadmap goal already minted, so it is not offered twice', () => {
    /* ADR-0045's own consequence: "each confirmed link is recorded ... so
       the same source doesn't offer to mint twice". Checking and unchecking
       a roadmap goal is the trigger the ADR names, and before this it
       re-offered and minted a duplicate every time. */
    const minted = { id: 'ms-1', roadmapGoalKey: 'pl-legal-name-usc' };
    const unrelated = { id: 'ms-2', roadmapGoalKey: null };

    expect(milestoneMintedByGoal([unrelated, minted], 'pl-legal-name-usc')).toBe(minted);
    expect(milestoneMintedByGoal([unrelated], 'pl-legal-name-usc')).toBe(null);
    expect(milestoneMintedByGoal([], 'pl-legal-name-usc')).toBe(null);
  });
});
