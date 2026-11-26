/* The roadmap ships two independent packs: Polish legal and paperwork steps,
   and social and presentation steps. Each has its own visibility switch.
   Packs are synchronous bundled content with no network dependency or seeded
   rows. journal/roadmap.ts stores personal status and visibility.

   This file holds stable keys; vocabulary/roadmapLabels.ts supplies localized
   wording (ADR-0002, ADR-0016). Goals can be checked independently, and their
   order follows the usual procedure for display. */

import type { InstitutionChange, RoadmapGoalStatus } from './types';

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
  { key: 'pl-legal-new-birth-copy' },
  { key: 'pl-legal-name-usc' },
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
/* Exported for its own test and for the reviewed-on guard in
   reviewedContent.ts, which reads each pack's reviewedOn. */
export const ROADMAP_PACKS = [POLISH_PACK] as const satisfies readonly RoadmapPack[];

/** Every goal key any bundled pack holds - what roadmapLabels.ts has to
    cover, so a goal added without wording is a typecheck failure rather
    than a raw key on screen. Read off ROADMAP_PACKS rather than written
    out, so adding a second country's pack widens what the wording layer
    must cover on its own: the pack list is the single place a new pack is
    declared, which is what makes it content work and not a schema
    change. */
export type RoadmapGoalKey = (typeof ROADMAP_PACKS)[number]['goals'][number]['key'] | SocialGoalKey;

export type RoadmapPackKey = (typeof ROADMAP_PACKS)[number]['key'];

/* The social and presentation group (pre-release human ticket 17): eight
   plain steps, none of them a legal or medical claim, so the pack has no
   review date and sits outside ROADMAP_PACKS, which the reviewed-on guard
   reads. Its keys start `social-`, never `pl-social-`: isCutTrackGoal
   below drops a tick by that older prefix, and these must survive it. The
   person trims the list with each step's own "hide" and the group with its
   switch (`prefs.roadmapSocialStepsShown`). */
const SOCIAL_GOALS = [
  { key: 'social-family' },
  { key: 'social-friends' },
  { key: 'social-work' },
  { key: 'social-name-pronouns' },
  { key: 'social-accounts' },
  { key: 'social-clothes' },
  { key: 'social-voice' },
  { key: 'social-hair-makeup' }
] as const satisfies readonly RoadmapGoal[];

export type SocialGoalKey = (typeof SOCIAL_GOALS)[number]['key'];

export const SOCIAL_PACK = { key: 'social', goals: SOCIAL_GOALS } as const;

/** Every built-in step on the roadmap, legal then social. */
export const BUILT_IN_GOALS: readonly RoadmapGoal<RoadmapGoalKey>[] = [...POLISH_PACK.goals, ...SOCIAL_PACK.goals];

const BUILT_IN_GOAL_KEYS: ReadonlySet<string> = new Set(BUILT_IN_GOALS.map((goal) => goal.key));

export const isBuiltInGoal = (key: string): key is RoadmapGoalKey => BUILT_IN_GOAL_KEYS.has(key);

const SOCIAL_GOAL_KEYS: ReadonlySet<string> = new Set(SOCIAL_GOALS.map((goal) => goal.key));

/** The pack a built-in step's tick is stored under (`roadmap_check.pack_key`). */
export const packKeyOf = (goalKey: RoadmapGoalKey): string => (SOCIAL_GOAL_KEYS.has(goalKey) ? SOCIAL_PACK.key : POLISH_PACK.key);

/** The social steps in view: none while the group's switch is off, and
    never one the person hid. Ticks stay stored either way. */
export function socialGoalsInView(shown: boolean, hiddenGoals: readonly string[]): readonly RoadmapGoal<SocialGoalKey>[] {
  if (!shown) return [];
  const hidden = new Set(hiddenGoals);
  return SOCIAL_GOALS.filter((goal) => !hidden.has(goal.key));
}

/** Whether a stored tick names a goal from one of the three tracks
    functional audit ticket 34 cut (social, presentational, medical).
    Migration 111 deleted those ticks, and a restore leaves them out of an
    older archive the same way. Matched by the track's key prefix rather
    than against the goals still bundled, so a tick naming a legal goal
    that a pack renamed earlier stays exactly as it was. */
export const isCutTrackGoal = (goalKey: string): boolean => /^pl-(social|presentational|medical)-/.test(goalKey);

/** Whether the Polish legal steps show.
    `choice` is the person's answer to the switch, null until they give
    one, and until then the steps stay closed in every language. They used
    to open for Polish, which put 721 words of court procedure on a screen
    of 754 before anybody asked for them. */
export function polishLegalStepsShown(choice: boolean | null): boolean {
  return choice ?? false;
}

/** The tracks cut by functional audit ticket 34 that a custom goal could
    still name. Migration 111 gave each one holding a goal a category whose
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

/* Name and document changes, per institution.
   After the ruling every institution is updated on its own, and one of
   them can take months: the Ombudsman documents a diploma from a closed
   university that was passed from the kuratorium to the ministry to the
   state archive, none of which would reissue it. So the
   post-ruling steps that each named an office (a new PESEL, the ID card,
   the passport, the driving licence, ZUS, the diplomas, and one step for
   "bank, insurers, clinic, phone operator") became a list of institutions,
   each moved through submitted, waiting and done on the days it happened.

   The six that were steps keep their goal keys, so a document filed
   against "the driving licence" before is filed against the driving
   licence still, with no migration of the link. `pl-legal-zus-ceidg` is
   NFZ and ZUS now; the key is only a name. Bank and employer are new.
   Wording is in vocabulary/roadmapLabels.ts, like the steps'. */
export const POLISH_INSTITUTIONS = [
  { key: 'pl-legal-pesel' },
  { key: 'pl-legal-id-card' },
  { key: 'pl-legal-passport' },
  { key: 'pl-legal-driving-licence' },
  { key: 'pl-legal-bank' },
  { key: 'pl-legal-zus-ceidg' },
  { key: 'pl-legal-employer' },
  { key: 'pl-legal-diplomas' }
] as const satisfies readonly RoadmapGoal[];

/** The day the institution notes were last checked against their sources,
    as an ISO day. Its own date rather than the pack's: the court steps were
    checked on POLISH_PACK.reviewedOn and the institutions later, and the
    reviewed-on guard warns on each by its own
    age. */
export const INSTITUTIONS_REVIEWED_ON = '2026-10-30';

export type RoadmapInstitutionKey = (typeof POLISH_INSTITUTIONS)[number]['key'];

/** The step that said "bank, insurers, clinic, phone operator" in one line,
    which the institution list replaces with one row per institution. */
const RETIRED_INSTITUTIONS_STEP = 'pl-legal-institutions';

const INSTITUTION_KEYS: ReadonlySet<string> = new Set(POLISH_INSTITUTIONS.map((one) => one.key));

export const isBuiltInInstitution = (key: string): key is RoadmapInstitutionKey => INSTITUTION_KEYS.has(key);

interface StoredTick {
  readonly packKey: string;
  readonly goalKey: string;
  /** A string rather than RoadmapGoalStatus: an archive's tick is read as
      whatever word it carries. */
  readonly status: string;
  readonly hidden: boolean;
}

/** What is left of a stored tick once ticket 35 has run: the same rule
    migration 114 applies to the journal and a restore applies to an older
    archive. A tick on a cut track goes, and so does one on the
    retired "bank, insurers, clinic" step. A tick on a step that became an
    institution goes too, since an institution moves by dated changes and a
    tick has no date to give one; only its hidden flag stays, because the
    person said that row was not theirs to see. Every other tick is kept as
    it was. */
export function keptTick<T extends StoredTick>(tick: T): T | null {
  if (isCutTrackGoal(tick.goalKey) || tick.goalKey === RETIRED_INSTITUTIONS_STEP) return null;
  if (!isBuiltInInstitution(tick.goalKey)) return tick;
  return tick.hidden ? { ...tick, status: 'unchecked' } : null;
}

/** Where one institution stands: the status its latest change gave it and
    the day of that change, or nulls while nothing has been recorded.
    "Latest" is by the day the change happened, then by the order it was
    written, so a change dated back is history and does not move the
    present. `changes` are this institution's, oldest first. */
export function institutionState(changes: readonly Pick<InstitutionChange, 'status' | 'epochDay'>[]): {
  status: string | null;
  epochDay: number | null;
} {
  let latest: Pick<InstitutionChange, 'status' | 'epochDay'> | null = null;
  for (const one of changes) if (latest === null || one.epochDay >= latest.epochDay) latest = one;
  return latest ? { status: latest.status, epochDay: latest.epochDay } : { status: null, epochDay: null };
}

/** The institutions as the screen draws them: the built-ins still in view
    and the ones the person added, in the order they were added. All of it
    sits behind the "Polish legal steps" switch, so with it off the list is
    empty and nothing stored changes. */
export function institutionList<Own>(
  shown: boolean,
  own: readonly Own[],
  hiddenGoals: readonly string[]
): { builtIns: readonly RoadmapGoal<RoadmapInstitutionKey>[]; own: readonly Own[] } {
  if (!shown) return { builtIns: [], own: [] };
  const hidden = new Set(hiddenGoals);
  return { builtIns: POLISH_INSTITUTIONS.filter((one) => !hidden.has(one.key)), own };
}

/** How many institutions shown are not done yet, a plain count like
    roadmapStepsLeft's. */
export function institutionsLeft(
  list: { builtIns: readonly RoadmapGoal[]; own: readonly { readonly id: string }[] },
  changes: readonly InstitutionChange[]
): number {
  const ids = [...list.builtIns.map((one) => one.key), ...list.own.map((one) => one.id)];
  return ids.filter((id) => institutionState(changes.filter((one) => one.institution === id)).status !== 'done').length;
}
