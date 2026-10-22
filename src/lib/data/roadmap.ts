/* The transition roadmap's country pack (phase 4 ticket 23; CONTEXT:
   "Roadmap goal", "Country pack"). Trimmed to the legal track by functional
   audit ticket 34: the social and presentational tracks repeated
   milestones, voice, hair removal and tryouts, and the medical track was
   the most clinical text outside Care. What is left is the Polish court
   procedure and the paperwork around it, shown behind the "Polish legal
   steps" switch (`polishLegalStepsShown` below).

   A country pack is bundled content, not reference data (CONTEXT:
   "Reference data"): nothing about it is per-install, so there is no row
   to seed and no table to migrate when a pack gains an item. It is
   compiled into the bundle and read synchronously, which is also the whole
   of what "fully offline" means here - a pack is inert data, so a screen
   showing one cannot reach for the network. Only personal status and visibility are stored, and
   journal/roadmap.ts owns those.

   Keys only, no text, the same rule builtins.ts follows and for the same
   reason (ADR-0002): wording lives in vocabulary/roadmapLabels.ts and
   changes with the language, and this file stays Node-tier safe by
   importing no paraglide (ADR-0016).

   Nothing here models one goal blocking another: each is independently
   checkable. Order is the order the procedure usually runs in, and it is a
   suggestion the screen renders rather than a rule anything enforces. */

import type { RoadmapGoalStatus } from './types';

interface RoadmapGoal<K extends string = string> {
  readonly key: K;
}

/* RoadmapPack stays exported only for its own test (AU-09 test-only review). */
export interface RoadmapPack<K extends string = string> {
  /** Prefixes every goal key in the pack, and is what a stored tick names
      the pack by. */
  readonly key: string;
  /** The day this pack's legal and procedural content was last checked
      against its sources, as an ISO day. Recorded here rather than in a
      comment because it is shown on screen: Polish gender-recognition
      procedure changes with legislation, so a reader needs to know how old
      what they are reading is. */
  readonly reviewedOn: string;
  readonly goals: readonly RoadmapGoal<K>[];
}

/* Polish pack. Sources and the reasoning behind the wording are in
   vocabulary/roadmapLabels.ts, next to the text itself. The court procedure
   Poland runs is one procedure, the same steps and documents whichever
   direction the applicant is transitioning. */
const POLISH_GOALS = [
  { key: 'pl-legal-birth-certificate' },
  { key: 'pl-legal-which-court' },
  { key: 'pl-legal-court-fee' },
  { key: 'pl-legal-opinions' },
  { key: 'pl-legal-application' },
  { key: 'pl-legal-file-it' },
  { key: 'pl-legal-formal-defects' },
  { key: 'pl-legal-remote-hearing' },
  { key: 'pl-legal-closed-hearing' },
  { key: 'pl-legal-fee-waiver' },
  { key: 'pl-legal-expert' },
  { key: 'pl-legal-written-reasons' },
  { key: 'pl-legal-appeal' },
  { key: 'pl-legal-final-copy' },
  { key: 'pl-legal-pesel' },
  { key: 'pl-legal-new-birth-copy' },
  { key: 'pl-legal-name-usc' },
  { key: 'pl-legal-id-card' },
  { key: 'pl-legal-passport' },
  { key: 'pl-legal-driving-licence' },
  { key: 'pl-legal-zus-ceidg' },
  { key: 'pl-legal-diplomas' },
  { key: 'pl-legal-institutions' },
  { key: 'pl-legal-document-set' }
] as const satisfies readonly RoadmapGoal[];

export const POLISH_PACK = {
  key: 'pl',
  reviewedOn: '2026-08-19',
  goals: POLISH_GOALS
} as const satisfies RoadmapPack;

/** Every pack this build bundles. One for now, by the phase 4 grilling
    session's scope decision (Q14): the structure holds a second country's
    content without a schema change, but populating one is separate content
    work. */
/* ROADMAP_PACKS stays exported only for its own test (AU-09 test-only review). */
export const ROADMAP_PACKS = [POLISH_PACK] as const satisfies readonly RoadmapPack[];

/** Every goal key any bundled pack holds - what roadmapLabels.ts has to
    cover, so a goal added without wording is a typecheck failure rather
    than a raw key on screen. Read off ROADMAP_PACKS rather than written
    out, so adding a second country's pack widens what the wording layer
    must cover on its own: the pack list is the single place a new pack is
    declared, which is what makes it content work and not a schema
    change. */
export type RoadmapGoalKey = (typeof ROADMAP_PACKS)[number]['goals'][number]['key'];

export type RoadmapPackKey = (typeof ROADMAP_PACKS)[number]['key'];

/** Whether a stored tick names a goal from one of the three tracks
    functional audit ticket 34 cut (social, presentational, medical).
    Migration 98 deleted those ticks, and a restore leaves them out of an
    older archive the same way. Matched by the track's key prefix rather
    than against the goals still bundled, so a tick naming a legal goal
    that a pack renamed earlier stays exactly as it was. */
export const isCutTrackGoal = (goalKey: string): boolean => /^pl-(social|presentational|medical)-/.test(goalKey);

/** Whether the Polish legal steps show (functional audit ticket 34).
    `choice` is the person's answer to the switch, null until they give
    one; until then the steps follow the app's language, on for Polish and
    off for everyone else, since the procedure is a Polish court's and an
    English reader is unlikely to be in front of one. */
export function polishLegalStepsShown(choice: boolean | null, locale: string): boolean {
  return choice ?? locale === 'pl';
}

/** The tracks cut by functional audit ticket 34 that a custom goal could
    still name. Migration 98 gave each one holding a goal a category whose
    uuid is the track key and whose name is empty, and a restore of an older
    archive does the same, so the person's own goals keep their grouping.
    roadmapLabels.ts says such a category's name in the current language
    until somebody renames it. */
export const LEGACY_ROADMAP_TRACKS = ['social', 'presentational', 'medical'] as const;

/** Where a custom goal sits: `LEGAL_GROUP` for the Polish legal steps, the
    one built-in group, or the uuid of one of the person's categories. */
export const LEGAL_GROUP = 'legal';

interface OwnGoal {
  readonly track: string;
  readonly status: RoadmapGoalStatus;
}

/** The roadmap as the screen draws it: the Polish legal group, and every
    category the person made with the goals they put in it. */
export interface RoadmapList<K extends string, C, Cat> {
  /** The pack's goals still in view. Empty while the switch is off; the
      stored ticks are untouched, so switching back brings back exactly
      what was ticked. */
  readonly goals: readonly RoadmapGoal<K>[];
  /** Goals the person added to the legal group, shown and hidden with it. */
  readonly legalGoals: readonly C[];
  /** Every category, an empty one included, in the order they were made,
      whatever the switch says: they are the person's own. */
  readonly categories: readonly { readonly category: Cat; readonly goals: readonly C[] }[];
}

export function roadmapList<K extends string, C extends OwnGoal, Cat extends { readonly id: string }>(
  pack: RoadmapPack<K>,
  shown: boolean,
  customGoals: readonly C[],
  hiddenGoals: readonly string[],
  categories: readonly Cat[]
): RoadmapList<K, C, Cat> {
  const hidden = new Set(hiddenGoals);
  return {
    goals: shown ? pack.goals.filter((goal) => !hidden.has(goal.key)) : [],
    legalGoals: shown ? customGoals.filter((goal) => goal.track === LEGAL_GROUP) : [],
    categories: categories.map((category) => ({
      category,
      goals: customGoals.filter((goal) => goal.track === category.id)
    }))
  };
}

/** Remaining work in the legal group, as a plain count rather than a
    fraction of the whole pack (DIRECTION.md rule 16). `not-my-path` counts
    as resolved the same way `checked` does: a step somebody has ruled out
    is not one they are still on. */
export function roadmapStepsLeft<K extends string, C extends OwnGoal, Cat>(
  list: RoadmapList<K, C, Cat>,
  statusOf: (key: K) => RoadmapGoalStatus
): number {
  return list.goals.filter((goal) => statusOf(goal.key) === 'unchecked').length + ownStepsLeft(list.legalGoals);
}

/** The same count for goals the person wrote, which carry their own tick. */
export function ownStepsLeft(goals: readonly { readonly status: RoadmapGoalStatus }[]): number {
  return goals.filter((goal) => goal.status === 'unchecked').length;
}
