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

import type { Lean } from './types';

export const ROADMAP_TRACKS = ['social', 'legal', 'presentational', 'medical'] as const;

export type RoadmapTrack = (typeof ROADMAP_TRACKS)[number];

/* Generic in its key so a pack declared `as const` keeps its literal keys
   all the way to the screen, where roadmapLabels.ts needs them to look
   wording up. The default keeps every other reader - the tests, a future
   contributed pack - writing plain `RoadmapGoal`. */
export interface RoadmapGoal<K extends string = string> {
  readonly key: K;
  readonly track: RoadmapTrack;
  /** CONTEXT: "Lean" (phase 5 ticket 43). Most of the Polish pack is
      `neutral`: it describes a legal procedure common to any transition
      direction. `pl-presentational-voice` and `pl-presentational-hair` are
      the exceptions - voice training and hair removal are, in practice,
      feminizing-transition work, since testosterone's own effects cover
      the masculinizing equivalent of both without training. */
  readonly lean: Lean;
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
  /* social - none of this is direction-specific: telling someone, being
     out at work or finding community reads the same regardless of which
     way a person is transitioning. */
  { key: 'pl-social-tell-one-person', track: 'social', lean: 'neutral' },
  { key: 'pl-social-close-people', track: 'social', lean: 'neutral' },
  { key: 'pl-social-name-at-work', track: 'social', lean: 'neutral' },
  { key: 'pl-social-community', track: 'social', lean: 'neutral' },
  /* legal - the court procedure Poland runs is one procedure, the same
     steps and documents whichever direction the applicant is transitioning. */
  { key: 'pl-legal-birth-certificate', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-which-court', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-court-fee', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-application', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-file-it', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-formal-defects', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-remote-hearing', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-closed-hearing', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-fee-waiver', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-expert', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-written-reasons', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-appeal', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-final-copy', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-pesel', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-new-birth-copy', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-name-usc', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-id-card', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-passport', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-driving-licence', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-zus-ceidg', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-diplomas', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-institutions', track: 'legal', lean: 'neutral' },
  { key: 'pl-legal-document-set', track: 'legal', lean: 'neutral' },
  /* presentational - clothes and a document photo are direction-neutral
     asks. Voice training and hair removal are, in practice, feminizing
     work: testosterone drops pitch and grows facial hair on its own, so a
     masculinizing transition rarely needs either as an active step. */
  { key: 'pl-presentational-clothes', track: 'presentational', lean: 'neutral' },
  { key: 'pl-presentational-voice', track: 'presentational', lean: 'femme' },
  { key: 'pl-presentational-hair', track: 'presentational', lean: 'femme' },
  { key: 'pl-presentational-photo', track: 'presentational', lean: 'neutral' },
  /* medical - the diagnosis and its paperwork are one pathway under Polish
     law (the same F64.0/HA60 code, the same two opinions) regardless of
     which hormone or direction it clears the way for. */
  { key: 'pl-medical-two-specialists', track: 'medical', lean: 'neutral' },
  { key: 'pl-medical-psychologist', track: 'medical', lean: 'neutral' },
  { key: 'pl-medical-psych-opinion', track: 'medical', lean: 'neutral' },
  { key: 'pl-medical-doctor-opinion', track: 'medical', lean: 'neutral' },
  { key: 'pl-medical-diagnosis-code', track: 'medical', lean: 'neutral' },
  { key: 'pl-medical-bloodwork', track: 'medical', lean: 'neutral' },
  { key: 'pl-medical-keep-opinions', track: 'medical', lean: 'neutral' }
] as const satisfies readonly RoadmapGoal[];

export type PolishGoalKey = (typeof POLISH_GOALS)[number]['key'];

export const POLISH_PACK = {
  key: 'pl',
  reviewedOn: '2026-08-19',
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

/** One track as the screen draws it: the track itself, whether the person
    has said it is not their path, and the goals left to show. */
export interface RoadmapSection<K extends string, C> {
  readonly track: RoadmapTrack;
  readonly dismissed: boolean;
  /** Empty for a dismissed track. The stored ticks are untouched - putting
      a track back brings back exactly what was ticked in it. */
  readonly goals: readonly RoadmapGoal<K>[];
  readonly customGoals: readonly C[];
}

/** The whole roadmap, track by track, with a dismissed track's goals folded
    away (phase 8 features ticket 49 item 5, CONTEXT: "Roadmap track").

    "Not my path" existed per goal only, so somebody the medical track has
    nothing to do with had to say so on each of its seven goals in turn.
    Said once per track it means the same thing one grain out, and it folds
    the same way `hidden` folds a hub row: the track stays on screen so it
    can be put back, and nothing inside it prompts. There is nothing further
    to gate - the milestone offer only fires from a tap on a goal, and a
    folded goal has nothing to tap.

    Built by walking `ROADMAP_TRACKS` rather than the goals present, which
    is what makes a fifth track cost nothing here and what
    roadmap.test.ts's coverage test is able to fail on: a screen listing
    tracks for itself would be free to miss one, and this is the one list. */
export function roadmapSections<K extends string, C extends { readonly track: string }>(
  pack: RoadmapPack<K>,
  customGoals: readonly C[],
  dismissedTracks: readonly string[]
): RoadmapSection<K, C>[] {
  const dismissed = new Set(dismissedTracks);
  return ROADMAP_TRACKS.map((track) => {
    const isDismissed = dismissed.has(track);
    return {
      track,
      dismissed: isDismissed,
      goals: isDismissed ? [] : goalsInTrack(pack, track),
      customGoals: isDismissed ? [] : customGoals.filter((goal) => goal.track === track)
    };
  });
}
