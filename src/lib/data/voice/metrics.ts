/* What a benchmark's six figures are, as data (phase 8 features ticket 27,
   ADR-0060).

   Ticket 09 gave the pitch figure a picture and two cited bands, and left
   the other five as bare numbers in a definition list. This is the table
   behind the screen that explains all six, and the reason it is a table at
   all rather than six paragraphs of markup is the same reason
   resources/directory.ts is one: the *rule* about which figure may carry a
   cited band is a safety claim, and a claim belongs somewhere a test can
   read it.

   Keys and the band rule only. What each figure means, how the app
   measures it and what it cannot tell you does not survive translation, so
   metricLabels.ts holds it (the same split as resources/directory.ts and
   resources/labels.ts, ADR-0016). This file takes nothing but types and
   bands.ts's pure arithmetic, so the Node tier can check the rule without
   dragging in paraglide.

   `as const`, so the key list also produces the union metricLabels.ts has
   to cover exhaustively: a figure added here without its seven fields is a
   typecheck failure rather than a raw key in front of somebody trying to
   find out what their number means.

   **Why one figure and not six.** ADR-0060 has the reasoning per figure
   and it is worth reading before adding a `bandLanguages` to anything:
   pitch spread has no significant sex difference in semitones and four to
   five semitones of *language* difference, a words-a-minute band cannot
   cross this app's own two passages (98 English words at about 1.32
   syllables each against 82 Polish at 1.74), and the two formants a phone
   can measure are precisely the two that carry no sex difference in the
   only Polish sex-split data there is. Habitual speaking pitch is the only
   figure that clears all three of the ADR's tests.

   VOICE_METRICS_REVIEWED_ON is a claim, not a build stamp, the way
   RESOURCES_REVIEWED_ON is. It says a person read the papers behind these
   sections and checked that the figures quoted are the figures published.
   Do not bump the date without doing the pass. */

import { referenceBands, type BandLanguage, type PitchBand } from '../../audio/bands.ts';

/** Whether a figure's absolute value can be read against published ranges
    or only against the same person's earlier takes (CONTEXT: "Referenced
    figure", "Own-series figure"). Named on screen in ordinary words rather
    than drawn as a badge, which is ADR-0060's own instruction: a missing
    band that is never explained reads as an omission or a bug. */
export type MetricTier = 'referenced' | 'ownSeries';

interface VoiceMetricShape {
  key: string;
  tier: MetricTier;
  /** The languages this figure has published ranges sourced for, which is
      empty for every Own-series figure. A band renders only where the
      cited population's language matches the passage being read
      (ADR-0060), so this is a list rather than a boolean: a citation
      covers the language it measured and no other. */
  bandLanguages: readonly BandLanguage[];
}

/** The day a person last checked every figure quoted on the metric
    reference screen against its source. */
export const VOICE_METRICS_REVIEWED_ON = '2026-09-04';

/* The order the summary lists them in, which is the order the reference
   screen reads in: the two pitch figures, how much the pitch moved, the
   rate, then the two figures that are as much about the recording as about
   the voice. */
const ENTRIES = [
  {
    key: 'pitch',
    tier: 'referenced',
    /* Both, because bands.ts carries mean and SD for both languages the
       app ships a passage in. A third passage language would arrive here
       with no figures behind it and draw no band, which is the point of
       the list. */
    bandLanguages: ['en', 'pl']
  },
  { key: 'span', tier: 'ownSeries', bandLanguages: [] },
  { key: 'spread', tier: 'ownSeries', bandLanguages: [] },
  { key: 'rate', tier: 'ownSeries', bandLanguages: [] },
  { key: 'resonance', tier: 'ownSeries', bandLanguages: [] },
  { key: 'room', tier: 'ownSeries', bandLanguages: [] }
] as const satisfies readonly VoiceMetricShape[];

export type VoiceMetricKey = (typeof ENTRIES)[number]['key'];

/** What a reader gets: one type whose `bandLanguages` is a plain list,
    rather than the union of six literal shapes ENTRIES has. The key stays
    narrow through that widening, which is what lets metricLabels.ts index
    its maps directly instead of casting them back to strings and carrying
    a fallback for a key that cannot exist. */
export interface VoiceMetric extends VoiceMetricShape {
  key: VoiceMetricKey;
}

export const VOICE_METRICS: readonly VoiceMetric[] = ENTRIES;

/** The bands a figure may draw for the language actually being read, or
    null where it may draw none.

    Null rather than an empty list, and rather than falling back to
    English: a figure with no band for this language says so in words on
    the reference screen, and an empty list would render as a legend with
    nothing in it. ADR-0060's first rule in one function - every screen
    that wants a band asks here rather than deciding for itself, so there
    is one place where "this citation does not cover this passage" is
    settled. */
export function bandsOf(metric: VoiceMetric, language: BandLanguage): readonly PitchBand[] | null {
  if (metric.tier !== 'referenced') return null;
  if (!metric.bandLanguages.includes(language)) return null;
  return referenceBands(language);
}

/** Where a figure's own explanation lives. Here rather than written out at
    each call site so that the link and the section it lands on cannot
    drift: the reference screen builds its section anchors from the same
    keys (ticket 27's own rule that renaming and explaining are one edit
    applies to the anchor too). */
export const metricHref = (key: VoiceMetricKey): string => `/settings/voice/metrics#${key}`;
