/* The transition roadmap's tracks and its country packs (phase 4 ticket
   23, CONTEXT: "Roadmap goal", "Country pack", "Roadmap track").

   A country pack is bundled content, not reference data (CONTEXT:
   "Reference data"): nothing about it is per-install, so there is no row
   to seed and no table to migrate when a pack gains an item. It is
   compiled into the bundle and read synchronously, which is also the whole
   of what "fully offline" means here - a pack is inert data, so a screen
   showing one cannot reach for the network. Only the ticks are stored, and
   journal/roadmap.ts owns those.

   Keys only, no text, the same rule builtins.ts follows and for the same
   reason (ADR-0002): wording lives in vocabulary/roadmapLabels.ts and
   changes with the language, and this file stays Node-tier safe by
   importing no paraglide (ADR-0016).

   The four tracks are the app's structure and a pack populates them; a
   goal belongs to exactly one. Nothing here models one goal blocking
   another, because the ticket's whole point is that each is independently
   checkable - a person part-way through a court case may well have done
   the presentational things first, or none of them. Order within a track
   is the order the procedure usually runs in, and it is a suggestion the
   screen renders rather than a rule anything enforces. */

export const ROADMAP_TRACKS = ['social', 'legal', 'presentational', 'medical'] as const;

export type RoadmapTrack = (typeof ROADMAP_TRACKS)[number];

/* Generic in its key so a pack declared `as const` keeps its literal keys
   all the way to the screen, where roadmapLabels.ts needs them to look
   wording up. The default keeps every other reader - the tests, a future
   contributed pack - writing plain `RoadmapGoal`. */
export interface RoadmapGoal<K extends string = string> {
  readonly key: K;
  readonly track: RoadmapTrack;
}

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
   vocabulary/roadmapLabels.ts, next to the text itself. */
const POLISH_GOALS = [
  /* social */
  { key: 'pl-social-tell-one-person', track: 'social' },
  { key: 'pl-social-close-people', track: 'social' },
  { key: 'pl-social-name-at-work', track: 'social' },
  { key: 'pl-social-community', track: 'social' },
  /* legal */
  { key: 'pl-legal-birth-certificate', track: 'legal' },
  { key: 'pl-legal-which-court', track: 'legal' },
  { key: 'pl-legal-court-fee', track: 'legal' },
  { key: 'pl-legal-application', track: 'legal' },
  { key: 'pl-legal-file-it', track: 'legal' },
  { key: 'pl-legal-formal-defects', track: 'legal' },
  { key: 'pl-legal-remote-hearing', track: 'legal' },
  { key: 'pl-legal-closed-hearing', track: 'legal' },
  { key: 'pl-legal-fee-waiver', track: 'legal' },
  { key: 'pl-legal-expert', track: 'legal' },
  { key: 'pl-legal-written-reasons', track: 'legal' },
  { key: 'pl-legal-appeal', track: 'legal' },
  { key: 'pl-legal-final-copy', track: 'legal' },
  { key: 'pl-legal-pesel', track: 'legal' },
  { key: 'pl-legal-new-birth-copy', track: 'legal' },
  { key: 'pl-legal-name-usc', track: 'legal' },
  { key: 'pl-legal-id-card', track: 'legal' },
  { key: 'pl-legal-passport', track: 'legal' },
  { key: 'pl-legal-driving-licence', track: 'legal' },
  { key: 'pl-legal-zus-ceidg', track: 'legal' },
  { key: 'pl-legal-diplomas', track: 'legal' },
  { key: 'pl-legal-institutions', track: 'legal' },
  { key: 'pl-legal-document-set', track: 'legal' },
  /* presentational */
  { key: 'pl-presentational-clothes', track: 'presentational' },
  { key: 'pl-presentational-voice', track: 'presentational' },
  { key: 'pl-presentational-hair', track: 'presentational' },
  { key: 'pl-presentational-photo', track: 'presentational' },
  /* medical */
  { key: 'pl-medical-two-specialists', track: 'medical' },
  { key: 'pl-medical-psychologist', track: 'medical' },
  { key: 'pl-medical-psych-opinion', track: 'medical' },
  { key: 'pl-medical-doctor-opinion', track: 'medical' },
  { key: 'pl-medical-diagnosis-code', track: 'medical' },
  { key: 'pl-medical-bloodwork', track: 'medical' },
  { key: 'pl-medical-keep-opinions', track: 'medical' }
] as const satisfies readonly RoadmapGoal[];

export type PolishGoalKey = (typeof POLISH_GOALS)[number]['key'];

export const POLISH_PACK = {
  key: 'pl',
  reviewedOn: '2026-08-18',
  goals: POLISH_GOALS
} as const satisfies RoadmapPack;

/** Every pack this build bundles. One for now, by the phase 4 grilling
    session's scope decision (Q14): the structure holds a second country's
    content without a schema change, but populating one is separate content
    work. */
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

/** One track's goals, in the order the pack lists them. */
export const goalsInTrack = <K extends string>(pack: RoadmapPack<K>, track: RoadmapTrack): RoadmapGoal<K>[] =>
  pack.goals.filter((goal) => goal.track === track);
