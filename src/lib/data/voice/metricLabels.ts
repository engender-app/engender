/* What each benchmark figure means, in words (phase 8 features ticket 27,
   ADR-0060). metrics.ts holds no wording at all, so this is where a figure
   gets its seven fields and where they change when the language does (the
   same split as resources/directory.ts and resources/labels.ts).

   **Seven fields, all mandatory, none nullable.** Every map below is typed
   against the key union metrics.ts derives from its own `as const` list, so
   a figure added there and half-explained here is a typecheck failure
   rather than a number on screen with nothing behind it. That is the whole
   mechanism of this file: ADR-0060's rule is that a figure ships explained
   or not at all, and `Record<VoiceMetricKey, Message>` is what makes it
   true rather than aspirational.

   The seventh field, `tier`, is the one that reads as redundant and is
   doing the most work. Five of the six figures carry no band, and a missing
   band nothing explains reads as an omission or a bug, so each figure says
   in ordinary words how far its own number travels. No badge: ADR-0060
   asks for a sentence, because a badge is a label on a voice and a
   sentence is a fact about a measurement.

   The sixth, `cannot`, is where the app admits what it cannot see. For
   pitch and for the formants both it states that formant spacing carries
   about three times the weight of mean pitch in how a listener genders a
   voice and that a phone microphone cannot measure it. Withholding that
   leaves somebody to conclude pitch is the thing to chase, which is the
   costliest misconception in this field, and an app that measures pitch
   well and says nothing would be reinforcing it.

   Author names, journal titles and years stay English in both catalogues,
   the way they are untranslated everywhere else in this app. The words
   around them do not: the Polish catalogue writes "i inni" rather than
   "and others" (vb_band_source_pl, effects_source), so the same paper is
   cited one way per language rather than two ways in one.

   Every map is indexed straight, with no cast and no fallback to the raw
   key: `VoiceMetric.key` is the union rather than `string`, so there is no
   missing-message case to handle and nothing that could put "resonance" on
   screen where a sentence belongs.

   This file imports paraglide, so nothing the Node tier touches may import
   it (ADR-0016). */

import { m } from '$lib/paraglide/messages';
import type { BandLanguage } from '$lib/audio/bands';
import type { VoiceMetricKey } from './metrics';

type Message = (inputs?: {}, options?: { locale?: 'en' | 'pl' }) => string;

/** The figure's own name, which is the label the summary and the compare
    view print beside the number. One name in one place: renaming a figure
    and explaining it were the same edit (ticket 27), and a second copy of
    the name is how the link and the label drift apart. */
const NAME: Record<VoiceMetricKey, Message> = {
  pitch: m.vb_pitch,
  span: m.vb_span,
  spread: m.vb_spread,
  rate: m.vb_rate,
  resonance: m.vb_resonance,
  room: m.vb_room
};

/** Field 1: what it measures, in one plain sentence. */
const MEASURES: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_measures,
  span: m.vm_span_measures,
  spread: m.vm_spread_measures,
  rate: m.vm_rate_measures,
  resonance: m.vm_resonance_measures,
  room: m.vm_room_measures
};

/** Field 2: how this app measures it. */
const HOW: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_how,
  span: m.vm_span_how,
  spread: m.vm_spread_how,
  rate: m.vm_rate_how,
  resonance: m.vm_resonance_how,
  room: m.vm_room_how
};

/** Field 3: what is physically known to change it. General mechanism only,
    never an instruction (ADR-0060: this screen explains and never
    instructs). */
const CHANGES: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_changes,
  span: m.vm_span_changes,
  spread: m.vm_spread_changes,
  rate: m.vm_rate_changes,
  resonance: m.vm_resonance_changes,
  room: m.vm_room_changes
};

/** Field 4: how well studied it is as a cue to how a listener genders a
    voice, in words rather than as a rating. A five-star scale here would
    be a score, and a score invites a target. */
const STUDIED: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_studied,
  span: m.vm_span_studied,
  spread: m.vm_spread_studied,
  rate: m.vm_rate_studied,
  resonance: m.vm_resonance_studied,
  room: m.vm_room_studied
};

/** Field 5: the typical cis figures with their population, language and
    task, or an explicit statement that no dependable range exists. Pitch is
    the only figure whose sentence introduces real ranges; the screen draws
    those from bands.ts rather than writing them into the copy, so what a
    citation says and what the graph draws cannot drift apart. */
const TYPICAL: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_typical,
  span: m.vm_span_typical,
  spread: m.vm_spread_typical,
  rate: m.vm_rate_typical,
  resonance: m.vm_resonance_typical,
  room: m.vm_room_typical
};

/** Field 6: what it cannot tell you. */
const CANNOT: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_cannot,
  span: m.vm_span_cannot,
  spread: m.vm_spread_cannot,
  rate: m.vm_rate_cannot,
  resonance: m.vm_resonance_cannot,
  room: m.vm_room_cannot
};

/** Field 7: which tier it is in, said in ordinary words. */
const TIER: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_tier,
  span: m.vm_span_tier,
  spread: m.vm_spread_tier,
  rate: m.vm_rate_tier,
  resonance: m.vm_resonance_tier,
  room: m.vm_room_tier
};

/** Whose figures a band is, named for the passage rather than for the
    corpus: what a person picks is a passage, and the language is a fact
    about the passage they picked. */
const PASSAGE_LANGUAGE: Record<BandLanguage, Message> = {
  en: m.vm_passage_en,
  pl: m.vm_passage_pl
};

/** Where the ranges come from, in the wording the pitch graph already uses
    for the same two citations (PitchBandsCaption.svelte). One source
    sentence per language, so a section that draws two languages' ranges
    cites both rather than crediting one for the other. */
const BAND_SOURCE: Record<BandLanguage, Message> = {
  en: m.vb_band_source_en,
  pl: m.vb_band_source_pl
};

export const metricName = (key: VoiceMetricKey): string => NAME[key]();

/** Which field a rendered pair is, so the screen can hang the pitch
    ranges under the one field they belong to without counting positions. */
export type MetricField =
  | 'measures'
  | 'how'
  | 'changes'
  | 'studied'
  | 'typical'
  | 'cannot'
  | 'tier';

/** All seven fields of one figure, in the order the screen reads them.

    Returned as a list rather than as seven named properties: the screen
    renders every field the same way and in one order, so a caller that
    could skip one would be a caller that could ship a figure
    half-explained. */
export function metricFields(
  key: VoiceMetricKey
): readonly { field: MetricField; heading: string; body: string }[] {
  return [
    { field: 'measures', heading: m.vm_field_measures(), body: MEASURES[key]() },
    { field: 'how', heading: m.vm_field_how(), body: HOW[key]() },
    { field: 'changes', heading: m.vm_field_changes(), body: CHANGES[key]() },
    { field: 'studied', heading: m.vm_field_studied(), body: STUDIED[key]() },
    { field: 'typical', heading: m.vm_field_typical(), body: TYPICAL[key]() },
    { field: 'cannot', heading: m.vm_field_cannot(), body: CANNOT[key]() },
    { field: 'tier', heading: m.vm_field_tier(), body: TIER[key]() }
  ];
}

export const passageLanguageName = (language: BandLanguage): string => PASSAGE_LANGUAGE[language]();
export const bandSource = (language: BandLanguage): string => BAND_SOURCE[language]();
