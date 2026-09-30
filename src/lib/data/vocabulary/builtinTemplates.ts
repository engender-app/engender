/* The part of the built-in catalogue (builtins.ts) the app reads at boot:
   milestone and regimen templates for the vocabulary mirror, entry templates
   for Today's debrief offer and the entry editor, the six dimension keys the
   first run's scales step offers before there is a journal, and the euphoria tag keys
   the good-day rule and the doubt journal read. Split out of builtins.ts in
   ux-carpet ticket 223 so the rest of the catalogue - dimensions, tag groups,
   affirmations, body regions, measurement and effect types, which only the
   reconcile, the archive and the demo read - stays out of the first-load
   graph. Same rule as builtins.ts: keys only, no display text, types only. */

import type { Lean, MilestoneTemplate, RegimenTemplate } from '../types.ts';

/* The six default scales an entry can carry a number on.

   Five of these are the original set, which predates this tracker and was
   never argued from a source: four of them describe the content of a
   gender (how feminine, how masculine, how binary, how strongly present)
   and the fifth describes a feeling about it. `gender_stability` came out
   of `.scratch/phase-5/gender-scale-axes-research.md` and describes
   movement. Every other scale here records a position; none of them can say
   that the position moved. `binary_nonbinary` and `agender_gendered` each
   collapse a day that shifted to whatever it averaged out at, which is the
   same reading a flat day gets.

   Deliberately not a certainty or doubt scale, which is the neighbouring
   idea and a different one. The GRRS measures rumination about one's own
   gender as a harm, and ADR-0037 has just removed the surface that asked
   somebody to narrate their doubt; a daily slider for how sure you are
   would put that question back on the log form. Steady and shifting are
   descriptive and neither is the better end.

   `social_recognition` was removed from the default vocabulary. Existing
   journal rows and their recorded values remain readable through the
   retired label mapping in labels.ts. */
export const BUILT_IN_DIMENSIONS = [
  { key: 'euphoria_dysphoria', min: 0, max: 100 },
  { key: 'femininity', min: 0, max: 100 },
  { key: 'masculinity', min: 0, max: 100 },
  { key: 'binary_nonbinary', min: 0, max: 100 },
  { key: 'agender_gendered', min: 0, max: 100 },
  { key: 'gender_stability', min: 0, max: 100 }
] as const;

export type BuiltInDimensionKey = (typeof BUILT_IN_DIMENSIONS)[number]['key'];

/** The three tags that count as a euphoria capture (CONTEXT: "Euphoria
    capture") - general, social and body, read as equals by anything that
    asks "did this day carry a euphoria capture" (the doubt journal's
    counterevidence pool, the good-day rule). Not narrowed to g-euphoria
    alone: someone whose euphoria is mostly social or body-specific tags
    g-soc-eu/g-body-eu faithfully for months and must not find the app
    blind to it (phase 5 ticket 32). */
export const EUPHORIA_TAG_KEYS = ['g-euphoria', 'g-soc-eu', 'g-body-eu'] as const;

/* MILESTONE_TEMPLATE_KEYS stays exported only for its own test (AU-09
   test-only review). */
export const MILESTONE_TEMPLATE_KEYS = [
  'hrt_start',
  'transition_start',
  'coming_out',
  'first_appointment',
  'name_change',
  'marker_change',
  'surgery',
  'first_public'
] as const;

export type MilestoneTemplateKey = (typeof MILESTONE_TEMPLATE_KEYS)[number];

/** CONTEXT: "Lean" (phase 5 ticket 43). All eight are neutral: a milestone
    type (starting HRT, coming out, a name change, surgery) names a kind of
    event, not a direction - the same eight apply whichever way a person is
    transitioning. */
/* MILESTONE_TEMPLATE_LEAN stays exported only for its own test (AU-09
   test-only review). */
export const MILESTONE_TEMPLATE_LEAN: Record<MilestoneTemplateKey, Lean> = {
  hrt_start: 'neutral',
  transition_start: 'neutral',
  coming_out: 'neutral',
  first_appointment: 'neutral',
  name_change: 'neutral',
  marker_change: 'neutral',
  surgery: 'neutral',
  first_public: 'neutral'
};

/* Five starting points across both estradiol and testosterone and more than
   one route (phase 5 ticket 42, CONTEXT: "Regimen template"), the same
   "keys only" shape MILESTONE_TEMPLATE_KEYS gives above - drug, ester and
   route wording lives in doseLabels.ts, which is where the rest of a
   regimen episode's own closed vocabulary already lives. No dose or
   interval key exists to carry either one by accident. */
/* REGIMEN_TEMPLATE_KEYS stays exported only for its own test (AU-09 test-only
   review). */
export const REGIMEN_TEMPLATE_KEYS = [
  'estradiol_valerate_im',
  'estradiol_oral',
  'estradiol_gel',
  'testosterone_cypionate_im',
  'testosterone_gel'
] as const;

export type RegimenTemplateKey = (typeof REGIMEN_TEMPLATE_KEYS)[number];

/** CONTEXT: "Lean" (phase 5 ticket 43). This is where lean does its real
    work: the estradiol templates are feminizing HRT, the testosterone ones
    masculinizing, so the split is the drug each one starts, not a judgment
    call. */
/* REGIMEN_TEMPLATE_LEAN stays exported only for its own test (AU-09 test-only
   review). */
export const REGIMEN_TEMPLATE_LEAN: Record<RegimenTemplateKey, Lean> = {
  estradiol_valerate_im: 'femme',
  estradiol_oral: 'femme',
  estradiol_gel: 'femme',
  testosterone_cypionate_im: 'masc',
  testosterone_gel: 'masc'
};

/* Entry templates (phase 4 features ticket 17): each names the tags and
   dimension values it pre-fills, the same "data lives here, wording lives
   in labels.ts" split BUILT_IN_PRESETS uses for its own `dims`. Values sit
   on the euphoria_dysphoria scale, the one dimension every built-in preset
   includes (BUILT_IN_PRESETS above), so a template's dial reading makes
   sense under any preset a person has chosen.

   The last eight were guided prompts (phase 4 features ticket 17) until
   phase 6 ticket 07 folded the two concepts into one: a prompt is a
   template with empty tags and empty dims, its note scaffold the whole of
   its content, the same wording it always had (labels.ts's
   `entryTemplateNoteScaffold`) but now editable, hideable and reachable
   from the "use template" sheet like any other. */
export const ENTRY_TEMPLATES = [
  { key: 'euphoria_day', tags: ['g-euphoria', 'g-body-eu', 'g-soc-eu'], dims: { euphoria_dysphoria: 85 } },
  { key: 'dysphoria_day', tags: ['g-body-dys', 'g-soc-dys'], dims: { euphoria_dysphoria: 20 } },
  { key: 'gendered_correctly', tags: ['g-gendered-ok'], dims: {} },
  { key: 'misgendered', tags: ['g-misgendered'], dims: {} },
  { key: 'good_day', tags: ['e-happy', 'e-calm'], dims: { euphoria_dysphoria: 75 } },
  { key: 'hard_day', tags: ['e-sad', 'e-anxious'], dims: { euphoria_dysphoria: 30 } },
  { key: 'euphoria_moment', tags: [], dims: {} },
  { key: 'dysphoria_moment', tags: [], dims: {} },
  { key: 'body_feeling', tags: [], dims: {} },
  { key: 'seen_moment', tags: [], dims: {} },
  { key: 'self_care', tags: [], dims: {} },
  { key: 'presentation_feeling', tags: [], dims: {} },
  { key: 'name_pronouns_feeling', tags: [], dims: {} },
  { key: 'proud_moment', tags: [], dims: {} },
  /* The appointment debrief (phase 6 ticket 08, CONTEXT: "Checklist"):
     reachable by default only through the debrief offer, never through the
     "use template" sheet or the entry-creation banner's random pool - both
     of those read the visible list, and this seeds hidden. Editable and
     un-hideable like any other built-in (What to Build #4) if someone
     wants it in their own rotation; the offer applies it directly by key
     regardless of its hidden flag. */
  { key: 'appointment_debrief', tags: [], dims: {}, hidden: true }
] as const;

export type EntryTemplateKey = (typeof ENTRY_TEMPLATES)[number]['key'];

export function milestoneTemplateRows(): MilestoneTemplate[] {
  return MILESTONE_TEMPLATE_KEYS.map((key) => ({ key, name: '', lean: MILESTONE_TEMPLATE_LEAN[key] }));
}

export function regimenTemplateRows(): RegimenTemplate[] {
  return REGIMEN_TEMPLATE_KEYS.map((key) => ({
    key,
    name: '',
    drug: '',
    ester: null,
    route: '',
    lean: REGIMEN_TEMPLATE_LEAN[key]
  }));
}
