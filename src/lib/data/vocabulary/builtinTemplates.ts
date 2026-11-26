/* The part of the built-in catalogue (builtins.ts) the app reads at boot:
   milestone and regimen templates for the vocabulary mirror, the guided
   prompts for the entry editor, the six dimension keys the
   first run's scales step offers before there is a journal, and the euphoria tag keys
   the good-day rule reads. Split out of builtins.ts in
   ux-carpet ticket 223 so the rest of the catalogue - dimensions, tag groups,
   body regions and effect types, which only the
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

/* Starting points across estradiol, testosterone and more than one route
   (phase 5 ticket 42, CONTEXT: "Regimen template"), widened by functional
   audit ticket 18 to the antiandrogens, progesterone and a GnRH agonist, the
   other drugs a feminizing or blocking regimen is built from. The same
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
  'testosterone_gel',
  'spironolactone_oral',
  'cyproterone_oral',
  'bicalutamide_oral',
  'progesterone_oral',
  'gnrh_agonist_im'
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
  testosterone_gel: 'masc',
  spironolactone_oral: 'femme',
  cyproterone_oral: 'femme',
  bicalutamide_oral: 'femme',
  progesterone_oral: 'femme',
  // A GnRH agonist blocks puberty or the body's own hormones in either
  // direction, so it speaks to neither preset first.
  gnrh_agonist_im: 'neutral'
};

/* The guided prompts the entry editor offers on a new entry, one at a time:
   keys only, the wording lives in labels.ts (`guidedPromptText`). They were
   entry templates with only a note scaffold until entry templates were
   removed (pre-release-human 18); the prompts themselves stayed. */
export const GUIDED_PROMPT_KEYS = [
  'euphoria_moment',
  'dysphoria_moment',
  'body_feeling',
  'seen_moment',
  'self_care',
  'presentation_feeling',
  'name_pronouns_feeling',
  'proud_moment'
] as const;

export type GuidedPromptKey = (typeof GUIDED_PROMPT_KEYS)[number];

export function milestoneTemplateRows(): MilestoneTemplate[] {
  return MILESTONE_TEMPLATE_KEYS.map((key) => ({ key, name: '' }));
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
