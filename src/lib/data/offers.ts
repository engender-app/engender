/* Every in-flow offer the app makes, in one list (phase 8 features ticket
   22, ADR-0045, ADR-0044).

   Five places in the app are the same sentence: something the person just
   did implies a record they might want, so the app asks. Ticking a
   transition goal on the roadmap. Reaching surgery day in the procedure
   hub. Adopting a tryout. Creating a milestone, and meeting one again on
   its anniversary.

   ADR-0045 governs all five - an automatic trigger never mints a record
   without confirmation - and before this the rule lived in five
   implementations that could each drift from it independently. Nothing here
   changes what any of them offers or when. What changes is that the rule is
   written once, below, and every trigger reaches its write through it.

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

   The spec named four offers. Registered here are five, and one of the four
   it named is deliberately absent. Both differences are findings rather
   than choices:

   **The surgery-day milestone was missed by the count.** ADR-0045's own
   text names it - "reaching surgery day or the recovery phase in the
   procedure hub" - and `settings/surgery/+page.svelte` has carried a
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

   ## Two differences between the five, documented rather than flattened

   **The tryout offer has two ways to say yes.** Adopting always closes the
   tryout; the milestone is what is being offered on top, so the sheet
   carries "adopt and add a milestone", "adopt without one", and "keep it".
   The middle answer is a decline of this offer that still writes the
   adoption, so the screen calls `answerOffer` with `createMilestone` false
   rather than with `'decline'` - it is not a refusal of the gesture, only
   of the record. `adoptTryout` is one transaction either way (ADR-0044).

   **The anniversary offer is made every year, on purpose.** The
   offer-once rule below is about a source that already holds the record it
   mints - a goal with its milestone, a procedure with its milestone. A
   felt-sense entry is not that: it is how the person feels about a
   milestone today, and last year's does not answer this year's. So the
   anniversary trigger passes no recorded id, and it recurs.

   Relative imports rather than `$lib`, and no runtime import that is not
   pure: offers.test.ts reads this file on the Node tier, where no alias
   exists (see vitest.config.ts). Every area arrives as a type. */

import { m } from '../paraglide/messages';
import type { FeltSenseArea, FeltSenseOwner } from './journal/feltSense';
import type { MilestonesArea } from './journal/milestones';
import type { NormalizedPhoto } from './journal/photos';
import type { ProceduresArea } from './journal/procedures';
import type { TryoutsArea } from './journal/tryouts';

/** Every offer this registry knows about. A key here with no entry in
    `OFFERS` does not compile, because `OFFERS` is a total `Record` over
    this union - demonstrated by deleting an entry below. */
export type OfferKey =
  | 'roadmap-goal-milestone'
  | 'surgery-day-milestone'
  | 'tryout-adoption-milestone'
  | 'new-milestone-felt-sense'
  | 'milestone-anniversary-felt-sense';

/** What the person is being offered. One record, named by the archive
    section that holds it, so an offer cannot claim to write something the
    journal has no home for. */
export type OfferedRecord = 'milestones' | 'feltSenseEntries';

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
  milestones: MilestonesArea;
  procedures: ProceduresArea;
  tryouts: TryoutsArea;
  feltSense: FeltSenseArea;
}

/** One offer's declaration, generic over what its trigger produces. The
    subject is the one thing that genuinely differs between the five - a
    goal and a date, a procedure id, a tryout being closed, a mood - so it
    is a type parameter rather than a union every entry has to narrow. */
export interface OfferRow<Subject> {
  key: OfferKey;
  trigger: string;
  offers: OfferedRecord;
  copy: OfferCopy;
  write(journal: OfferJournal, subject: Subject): Promise<void>;
}

/** Keeps the declaration site honest: the key has to be a real offer, and
    `write` has to return nothing - an offer whose write handed a value back
    would invite a caller to use it, and what a confirmed offer produces is
    a record in the journal rather than a value on a screen. */
function offer<Key extends OfferKey, Subject>(declared: OfferRow<Subject> & { key: Key }) {
  return declared;
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

const FELT_SENSE_COPY: Pick<OfferCopy, 'confirm' | 'decline'> = {
  confirm: () => m.tryout_feeling_save(),
  decline: () => m.skip()
};

/** Every offer, keyed by itself. A `Record` over `OfferKey` rather than an
    array, so an offer added to the union with no entry here is a
    missing-property error at this line - and so a screen names the offer it
    is making rather than searching a list for it. */
export const OFFERS = {
  'roadmap-goal-milestone': offer({
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
  }),

  'surgery-day-milestone': offer({
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
  }),

  'tryout-adoption-milestone': offer({
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
  }),

  'new-milestone-felt-sense': offer({
    key: 'new-milestone-felt-sense',
    trigger: 'a milestone is created - never when an existing one is edited',
    offers: 'feltSenseEntries',
    copy: { title: () => m.ms_feeling_new_title(), ...FELT_SENSE_COPY },
    write: async ({ feltSense }: OfferJournal, subject: OfferedFeltSense) => {
      await feltSense.add(subject.owner, { epochDay: subject.epochDay, mood: subject.mood, note: subject.note });
    }
  }),

  'milestone-anniversary-felt-sense': offer({
    key: 'milestone-anniversary-felt-sense',
    trigger: 'a milestone shown on an anniversary of its own day',
    offers: 'feltSenseEntries',
    copy: { title: () => m.ms_feeling_anniv_title(), ...FELT_SENSE_COPY },
    write: async ({ feltSense }: OfferJournal, subject: OfferedFeltSense) => {
      await feltSense.add(subject.owner, { epochDay: subject.epochDay, mood: subject.mood, note: subject.note });
    }
  })
} satisfies Record<OfferKey, OfferRow<never>>;

/** `OfferKey` as a value, read off `OFFERS` rather than typed out again -
    the hand-kept second copy is exactly what the completeness check exists
    to stop needing. Safe to derive here, unlike the `Record` above: this
    only has to name what today's registry holds for `unregisteredOffers` to
    check a *shortened copy* against, not stand as its own source of truth,
    which is `OfferKey`'s job. */
export const OFFER_KEYS = Object.keys(OFFERS) as readonly OfferKey[];

/** The runtime half of the completeness check: which offers a given list is
    missing, measured against the whole `OfferKey` domain rather than
    against the list's own contents - so offers.test.ts can show the rule
    failing on a named, shortened registry instead of only asserting that it
    never does. */
export function unregisteredOffers(rows: readonly { key: OfferKey }[]): OfferKey[] {
  const present = new Set(rows.map((row) => row.key));
  return OFFER_KEYS.filter((key) => !present.has(key));
}

/** Whether a trigger may ask at all, and with what.

    ADR-0045's second half: "each confirmed link is recorded ... so the same
    source doesn't offer to mint twice". `recordedId` is the record this
    source already minted, if it has one - a milestone linked to the goal, a
    milestone linked to the procedure - and an offer with one is not made.
    Null is the open case and the subject comes back unchanged, so a screen
    assigns its offer state *through* this rather than beside it and cannot
    forget the check.

    A recurring offer passes null every time by design; the header says
    which one does and why. */
export function openOffer<Subject>(subject: Subject, recordedId: string | null): Subject | null {
  return recordedId === null ? subject : null;
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
