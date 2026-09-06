/* Every in-flow offer the app makes, in one list (phase 8 features ticket
   22, ADR-0045, ADR-0044).

   Eight places in the app are the same sentence: something the person just
   did implies a record they might want, so the app asks. Ticking a
   transition goal on the roadmap. Reaching surgery day in the procedure
   hub. Adopting a tryout. Creating a milestone, and meeting one again on
   its anniversary. Deciding an area is finished. And, since ticket 05, the
   two the return surface makes: one dose slot that passed unlogged, and a
   wear session left running through a gap.

   ADR-0045 governs all of them: an automatic trigger never mints a record
   without confirmation. Before ticket 22 that rule lived in five
   implementations that could each drift from it independently, and what
   changed is that it is written once, below, and every trigger reaches its
   write through it. A new offer since then declares itself here rather than
   hand-wiring a sixth.

   ## What one entry declares

     key      the offer, as the screens address it
     trigger  what has to happen before it is offered, in words. Audit
              rather than behaviour: the trigger itself is a condition on a
              screen and stays there, and this is what makes the list
              readable as a list
     offers   the record the person is being offered. Never two: an offer
              that wrote a second thing would be a second offer wearing the
              first one's confirmation
     copy     what the app says when it asks, and on the two answers
     write    what confirming writes, through the owning area's own method.
              Never a raw SQL string and never a second write path - the
              same discipline day.ts and lastWrite.ts keep

   ## The two that are here and the two that are not

   The spec named four offers. Six were registered by ticket 22, and one of the four
   it named is deliberately absent. Both differences are findings rather
   than choices:

   **The surgery-day milestone was missed by the count.** ADR-0045's own
   text names it - "reaching surgery day or the recovery phase in the
   procedure hub" - and `health/surgery/+page.svelte` has carried a
   confirmation sheet for it since phase 5 ticket 12. A registry whose
   value is that the list is auditable cannot leave an existing offer off
   it, so it is registered.

   **The felt-sense offer is two entries, not one.** It is made at two
   different moments - right after a milestone is created, and again on
   each anniversary of one - and each moment says a different sentence
   (`ms_feeling_new_title`, `ms_feeling_anniv_title`). One entry with two
   titles would be an optional field standing in for the distinction.

   **"Start an era here" is not an offer, and is not registered.** The day
   view's link (`day/[day]/+page.svelte`, phase 6 ticket 01) mints nothing
   and pre-fills nothing on the person's behalf: it navigates to the era
   editor with the day in its start bound, and the editor's own save is the
   only write. There is no confirmation rule to centralise for a link, and
   registering it would put a row in this list whose `write` is
   `goto`. Named here so the next reader finds the reason rather than the
   gap.

   ## Differences between them, documented rather than flattened

   **The tryout offer has two ways to say yes.** Adopting always closes the
   tryout; the milestone is what is being offered on top, so the sheet
   carries "adopt and add a milestone", "adopt without one", and "keep it".
   The middle answer is a decline of this offer that still writes the
   adoption, so the screen calls `answerOffer` with `createMilestone` false
   rather than with `'decline'` - it is not a refusal of the gesture, only
   of the record. `adoptTryout` is one transaction either way (ADR-0044).

   **Not offering twice is each source's own check, not a rule here.**
   ADR-0045's second half is about a source that already holds the record
   it mints, and what that means is different in each of the three places
   it applies: a goal reads `roadmapGoalKey` off the milestones
   (`milestoneMintedByGoal` below), a procedure reads its own linked
   milestone, and a tryout has no minted record at all - it cannot be
   adopted twice because it has an end day. Writing one function over
   those three would take an argument each caller computes differently and
   enforce nothing, so each asks its own question and this file holds only
   the one rule that genuinely is shared.

   The anniversary offer asks no such question, on purpose: a felt-sense
   entry is how the person feels about a milestone today, and last year's
   does not answer this year's, so it recurs.

   Relative imports rather than `$lib`, and no runtime import that is not
   pure: offers.test.ts reads this file on the Node tier, where no alias
   exists (see vitest.config.ts). Every area arrives as a type. */

import { m } from '../paraglide/messages';
import { startOfDayTimestamp } from './epochDay';
import type { FinishableArea, SuspendableArea } from './areaState';
import type { AreaStatesArea } from './journal/areaStates';
import type { DoseEventInput, DosesArea } from './journal/doses';
import type { FeltSenseArea, FeltSenseOwner } from './journal/feltSense';
import type { MilestonesArea } from './journal/milestones';
import type { NormalizedPhoto } from './journal/photos';
import type { ProceduresArea } from './journal/procedures';
import type { TryoutsArea } from './journal/tryouts';
import type { WearSessionsArea } from './journal/wearSessions';
import type { WearKind } from './types';

/** Every offer this registry knows about. A key here with no entry in
    `OFFERS` does not compile, because `OFFERS` is a total `Record` over
    this union - demonstrated by deleting an entry below. */
export type OfferKey =
  | 'roadmap-goal-milestone'
  | 'surgery-day-milestone'
  | 'tryout-adoption-milestone'
  | 'new-milestone-felt-sense'
  | 'milestone-anniversary-felt-sense'
  | 'area-finished'
  | 'area-suspended'
  | 'returning-dose'
  | 'returning-wear-session';

/** What the person is being offered. One record, named by the archive
    section that holds it, so an offer cannot claim to write something the
    journal has no home for. */
type OfferedRecord = 'milestones' | 'feltSenseEntries' | 'areaStates' | 'doseEvents' | 'wearSessions';

/** How the person answered. `'decline'` is a real answer and not the
    absence of one: it closes the offer and writes nothing. */
export type OfferAnswer = 'confirm' | 'decline';

/** What the app says when it asks. Held here rather than at each sheet so
    the list is auditable as copy too - the ticket asks for the trigger, the
    record and the words, and words kept anywhere else would be a second
    list. The strings themselves are unchanged from what the five screens
    already said. */
export interface OfferCopy {
  title: () => string;
  confirm: () => string;
  decline: () => string;
}

/** The areas an offer's `write` may reach: the ones `openJournal` already
    built, so a confirmed offer writes through exactly the path the owning
    screen would. */
export interface OfferJournal {
  areaStates: AreaStatesArea;
  milestones: MilestonesArea;
  procedures: ProceduresArea;
  tryouts: TryoutsArea;
  feltSense: FeltSenseArea;
  doses: DosesArea;
  wearSessions: WearSessionsArea;
}

/** One offer's declaration, generic over what its trigger produces. The
    subject is the one thing that genuinely differs between the five - a
    goal and a date, a procedure id, a tryout being closed, a mood - so it
    is a type parameter rather than a union every entry has to narrow. */
interface OfferRow<Subject> {
  key: OfferKey;
  trigger: string;
  offers: OfferedRecord;
  copy: OfferCopy;
  write(journal: OfferJournal, subject: Subject): Promise<void>;
}

/** What ticking a roadmap goal offers: a milestone named after the goal, on
    a day the person can change, with an optional photo. `roadmapGoalKey` is
    what links it back, and what stops the goal offering twice. */
export interface RoadmapGoalMilestone {
  title: string;
  epochDay: number;
  photo: NormalizedPhoto | null;
  goalKey: string | null;
}

/** What accepting the finish offer writes: every area the hub row fronts,
    and the day the person settled on. The areas travel with the subject
    rather than being looked up in the write, because a row fronting two
    sections finishes both in one call and the screen already knows which
    (areaGroups.ts). */
export interface FinishedArea {
  areas: readonly FinishableArea[];
  epochDay: number;
}

/** What accepting the suspend action writes: `FinishedArea`'s own shape,
    narrowed to the areas that can carry a suspended day (phase 8 features
    ticket 51). */
export interface SuspendedArea {
  areas: readonly SuspendableArea[];
  epochDay: number;
}

/** What a felt-sense offer writes: whose it is, when, and how it felt. */
export interface OfferedFeltSense {
  owner: FeltSenseOwner;
  epochDay: number;
  mood: number;
  note: string | null;
}

/** What adopting a tryout writes. `createMilestone` false is the middle
    answer described in the header: the adoption still commits, the
    milestone does not. */
export interface TryoutAdoption {
  tryoutId: string;
  endEpochDay: number;
  createMilestone: boolean;
  milestoneTitle: string;
  milestoneEpochDay: number;
}

/** What backfilling one missed dose slot writes. The whole `DoseEventInput`
    rather than a slot plus a couple of fields: the site an injection went
    into and the vehicle it was in are things only the person knows, the
    write path already refuses a dose without them, and narrowing this to
    "the slot, and the bits the sheet collected" would have been a second,
    looser dose input beside the real one. What the return surface does is
    fix the timestamp to the slot's day and pre-fill the figure the schedule
    was expecting; everything else is the sheet's, and the sheet is the
    confirmation. */
export type ReturningDose = DoseEventInput;

/** What closing a forgotten wear session writes: the session, and the day
    it actually ended.

    Deliberately not a duration the app worked out. A timer left running
    through a five-week gap has no honest end time in it - the app knows
    when it started and nothing at all about when it came off - so the
    person names the day and the write turns that into a duration. Assuming
    today would put a five-week wear session into a year of wear data, which
    is the one failure this offer exists to prevent. */
export interface ReturningWearSession {
  sessionId: string;
  /** Carried rather than re-read: `upsertSession` writes every column of
      the row it is given (wearSessions.ts), so closing a session has to
      hand back the kind it was started as. Named around
      `WaitingItem.kind`, which is already the discriminant of the list this
      subject is built from. */
  wearKind: WearKind;
  startTimestamp: number;
  endEpochDay: number;
}

const FELT_SENSE_COPY: Pick<OfferCopy, 'confirm' | 'decline'> = {
  confirm: () => m.tryout_feeling_save(),
  decline: () => m.skip()
};

/** Both felt-sense offers write the same row through the same method; only
    the moment they are made at, and so the sentence they say, differ. */
const writeFeltSense = async ({ feltSense }: OfferJournal, subject: OfferedFeltSense) => {
  await feltSense.add(subject.owner, { epochDay: subject.epochDay, mood: subject.mood, note: subject.note });
};

/** Every offer, keyed by itself. A `Record` over `OfferKey` rather than an
    array, so an offer added to the union with no entry here is a
    missing-property error at this line - and so a screen names the offer it
    is making rather than searching a list for it. */
export const OFFERS = {
  'roadmap-goal-milestone': {
    key: 'roadmap-goal-milestone',
    trigger: 'a transition roadmap goal goes from unchecked to checked, while roadmapMilestoneSyncEnabled is on',
    offers: 'milestones',
    copy: {
      title: () => m.roadmap_milestone_prompt_sheet_title(),
      confirm: () => m.roadmap_milestone_prompt_add(),
      decline: () => m.skip()
    },
    write: async ({ milestones }: OfferJournal, subject: RoadmapGoalMilestone) => {
      await milestones.upsertMilestone({
        name: subject.title,
        epochDay: subject.epochDay,
        roadmapGoalKey: subject.goalKey,
        photo: subject.photo ? { action: 'replace', photo: subject.photo } : { action: 'preserve' }
      });
    }
  },

  'surgery-day-milestone': {
    key: 'surgery-day-milestone',
    trigger: 'a procedure reaches its surgery day, or the recovery phase after it, with no milestone linked yet',
    offers: 'milestones',
    copy: {
      title: () => m.surgery_milestone_confirm_sheet(),
      confirm: () => m.surgery_milestone_prompt_action(),
      decline: () => m.keep_it()
    },
    /* The procedure's own method, which names the milestone after the
       procedure and links it back by id - so this offer needs no fields of
       its own beyond which procedure it is about. */
    write: async ({ procedures }: OfferJournal, subject: { procedureId: string }) => {
      await procedures.recordSurgeryMilestone(subject.procedureId);
    }
  },

  'tryout-adoption-milestone': {
    key: 'tryout-adoption-milestone',
    trigger: 'a name or pronoun tryout that has not ended is adopted permanently',
    offers: 'milestones',
    copy: {
      title: () => m.tryout_adopt_sheet_title(),
      confirm: () => m.tryout_adopt_confirm_add(),
      decline: () => m.keep_it()
    },
    write: async ({ tryouts }: OfferJournal, subject: TryoutAdoption) => {
      await tryouts.adoptTryout(subject.tryoutId, {
        endEpochDay: subject.endEpochDay,
        createMilestone: subject.createMilestone,
        milestoneTitle: subject.milestoneTitle,
        milestoneEpochDay: subject.milestoneEpochDay
      });
    }
  },

  'new-milestone-felt-sense': {
    key: 'new-milestone-felt-sense',
    trigger: 'a milestone is created - never when an existing one is edited',
    offers: 'feltSenseEntries',
    copy: { title: () => m.ms_feeling_new_title(), ...FELT_SENSE_COPY },
    write: writeFeltSense
  },

  'milestone-anniversary-felt-sense': {
    key: 'milestone-anniversary-felt-sense',
    trigger: 'a milestone shown on an anniversary of its own day',
    offers: 'feltSenseEntries',
    copy: { title: () => m.ms_feeling_anniv_title(), ...FELT_SENSE_COPY },
    write: writeFeltSense
  },

  /* Phase 8 features ticket 04. The sixth, and the first whose trigger is
     the absence of writes rather than a write: an area with something in it
     and nothing added for half a year.

     Two things keep it from being a nag, and neither is a rule this file
     could hold. It is offered on the area's own screen, which somebody
     reached on purpose, and never on Home and never as a notification. And
     the no is kept forever in `areaFinishOfferDeclined` - which is this
     offer's own version of ADR-0045's second half, the same way the roadmap
     reads `roadmapGoalKey` and the surgery hub reads its linked milestone.
     The threshold itself is `areaGroups.ts`'s FINISH_SUGGESTION_QUIET_DAYS.

     It is also the one entry whose sheet a person can open without being
     offered anything, from the control at the foot of the same screen. That
     does not make it two offers: the sentence, the record and the write are
     the same, and only what opened the sheet differs. What it does mean is
     that `write` below is reached on a path no automatic trigger started,
     which is fine - ADR-0045 constrains triggers, not people. */
  'area-finished': {
    key: 'area-finished',
    trigger:
      "the offer: an area with at least one write, none of them inside FINISH_SUGGESTION_QUIET_DAYS, not already hidden or finished, and never declined before. The same sheet is also opened by hand from the area's own screen, and confirming it reaches this write through the same call - one path to the record rather than a second one beside the registry",
    offers: 'areaStates',
    copy: {
      title: () => m.area_finish_offer_title(),
      confirm: () => m.area_finish_confirm(),
      decline: () => m.area_finish_offer_dismiss()
    },
    write: async ({ areaStates }: OfferJournal, subject: FinishedArea) => {
      await areaStates.setAreasFinished(subject.areas, subject.epochDay);
    }
  },

  /* Phase 8 features ticket 51. Manual only, with no automatic trigger and
     no declined-forever preference the way `area-finished` has one: nothing
     about a stopped stream implies a pause the way nothing added for
     `FINISH_SUGGESTION_QUIET_DAYS` implies a finish, so there is no
     observation here to suggest from. It is registered anyway, rather than
     the sheet writing `setAreasSuspended` directly, for the same reason
     every other write in this file is: one path to the record, and the sheet
     is the confirmation regardless of what opened it. */
  'area-suspended': {
    key: 'area-suspended',
    trigger: "opened by hand from the area's own screen; no automatic trigger offers this",
    offers: 'areaStates',
    copy: {
      title: () => m.area_suspend_sheet_title(),
      confirm: () => m.area_suspend_confirm(),
      decline: () => m.area_suspend_cancel()
    },
    write: async ({ areaStates }: OfferJournal, subject: SuspendedArea) => {
      await areaStates.setAreasSuspended(subject.areas, subject.epochDay);
    }
  },
  /* Phase 8 features ticket 05, ADR-0062. The two the return surface makes,
     and the first two whose trigger is neither a write nor the absence of
     one but a person opening the app after three weeks away.

     Both are backfill, and both are narrowed hard for the reason the
     ticket gives: an offer here asks about exactly one item and queues
     nothing about any other. Logging the dose from one slot says nothing
     about the eleven slots around it, and closing one wear session asks
     about no other session. That is not a rule this file could enforce -
     it is a property of the subject each one takes, which names one record
     and carries no list.

     Neither keeps a no. ADR-0062 makes the surface a moment rather than a
     place: it is shown once per gap and linked from nowhere, so a decline
     lives exactly as long as the screen it was made on, and a preference
     recording it would be storing an answer nothing will ever ask for
     again. That is the difference from `area-finished` above, which is
     offered on a screen somebody can walk back onto tomorrow. */
  'returning-dose': {
    key: 'returning-dose',
    trigger:
      'the return surface, for the most recent slot the schedule expected that passed with nothing logged against it - never a slot on today, which has not passed yet and which Home\'s own dose panel asks about',
    offers: 'doseEvents',
    copy: {
      title: () => m.coming_back_dose_title(),
      confirm: () => m.dose_save(),
      decline: () => m.coming_back_leave_it()
    },
    /* The dose log's own write path, timestamped to the slot's day. One
       dose: nothing here loops, and there is no bulk arm to reach for. */
    write: async ({ doses }: OfferJournal, subject: ReturningDose) => {
      await doses.upsertDose(subject);
    }
  },

  'returning-wear-session': {
    key: 'returning-wear-session',
    trigger: 'the return surface, when a wear session was still running through the gap',
    offers: 'wearSessions',
    copy: {
      title: () => m.coming_back_wear_title(),
      confirm: () => m.coming_back_wear_confirm(),
      decline: () => m.coming_back_wear_decline()
    },
    /* The whole of the chosen day, since a day is all the person is being
       asked for: "it came off on the 14th" becomes a session running to the
       end of the 14th, and the sheet says so in as many words rather than
       leaving the reader to work out which end of the day it took. A
       midpoint would be the app guessing, which is the one thing this offer
       is written not to do. `upsertSession` reconciles this session's own reminder
       on the way through (wearSessions.ts), which is what stops a
       five-week-old timer's reminder outliving the session it was for.

       `reminderHoursAfterStart` is left off rather than passed as null:
       omitting the field is how that area says "leave the reminder alone",
       and clearing one the person set by hand is not part of closing a
       session. */
    write: async ({ wearSessions }: OfferJournal, subject: ReturningWearSession) => {
      await wearSessions.upsertSession({
        id: subject.sessionId,
        kind: subject.wearKind,
        startTimestamp: subject.startTimestamp,
        durationMs: startOfDayTimestamp(subject.endEpochDay + 1) - subject.startTimestamp
      });
    }
  }
} satisfies { [K in OfferKey]: OfferRow<never> & { key: K } };

/** `OfferKey` as a value, read off `OFFERS` rather than typed out again, so
    a caller wanting them all walks the registry instead of a second list.

    No runtime completeness check sits beside it, unlike
    `unprompted/registry.ts`'s `unregisteredKinds`, and the difference is
    the shape of the two registries rather than an omission here. That one
    is an array, so an `Exclude` is all that stands between it and a kind
    nobody listed, and a runtime mirror of that check earns its place. This
    one is a total `Record` over `OfferKey`: a missing entry is a missing
    property, refused at the `satisfies` line above. A runtime function
    derived from `OFFERS` could only ever fail on a copy of `OFFERS` that a
    test shortened by hand, which is a check of `filter` wearing this
    registry's name. */
export const OFFER_KEYS = Object.keys(OFFERS) as readonly OfferKey[];

/** The milestone a roadmap goal has already minted, if it has one.

    ADR-0045's second half - "each confirmed link is recorded ... so the
    same source doesn't offer to mint twice" - needs somebody to look that
    link up, and `roadmapGoalKey` is where it is recorded (types.ts). Here
    rather than inline on the roadmap screen so it can be tested with no
    driver.

    Only the roadmap needs it. The surgery hub reads its own link through
    `procedures.getMilestone`, and a tryout has no minted record to look
    for - what stops it being adopted twice is its own end day. */
export function milestoneMintedByGoal<M extends { id: string; roadmapGoalKey?: string | null }>(
  milestones: readonly M[],
  goalKey: string
): M | null {
  return milestones.find((milestone) => milestone.roadmapGoalKey === goalKey) ?? null;
}

/** The only path from an open offer to a write (ADR-0045).

    A trigger opens an offer and never writes; this is what writes, and only
    on a confirmation of an offer that is actually open. `subject` null is
    the closed case - a confirm arriving from a stale handler after the
    sheet went away agreed to nothing - and it writes nothing rather than
    reaching for fields that are not there.

    Returns whether it wrote, which is what a screen needs to know to close
    itself and to leave the triggering state alone on a decline. */
export async function answerOffer<Subject>(
  offerRow: OfferRow<Subject>,
  subject: Subject | null,
  answer: OfferAnswer,
  journal: OfferJournal
): Promise<boolean> {
  if (answer === 'decline' || subject === null) return false;
  await offerRow.write(journal, subject);
  return true;
}
