/* Words for the seven fields of each benchmark metric (ADR-0060).
   Every map covers the metric key union so a new figure needs copy. */

import { m } from '$lib/paraglide/messages';
import type { VoiceMetricKey } from './metrics';

type Message = (inputs?: {}, options?: { locale?: 'en' | 'pl' }) => string;

/** The figure's own name, which is the label the summary and the compare
    view print beside the number. One name in one place: renaming a figure
    and explaining it were the same edit, and a second copy of
    the name is how the link and the label drift apart. */
const NAME: Record<VoiceMetricKey, Message> = {
  pitch: m.vb_pitch,
  span: m.vb_span,
  spread: m.vb_spread,
  rate: m.vb_rate,
  resonance: m.vb_resonance,
  room: m.vb_room,
  scale: m.vb_scale
};

/** Field 1: what it measures, in one plain sentence. */
const MEASURES: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_measures,
  span: m.vm_span_measures,
  spread: m.vm_spread_measures,
  rate: m.vm_rate_measures,
  resonance: m.vm_resonance_measures,
  room: m.vm_room_measures,
  scale: m.vm_scale_measures
};

/** Field 2: how this app measures it. */
const HOW: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_how,
  span: m.vm_span_how,
  spread: m.vm_spread_how,
  rate: m.vm_rate_how,
  resonance: m.vm_resonance_how,
  room: m.vm_room_how,
  scale: m.vm_scale_how
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
  room: m.vm_room_changes,
  scale: m.vm_scale_changes
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
  room: m.vm_room_studied,
  scale: m.vm_scale_studied
};

/** Field 5: what published context can and cannot say. */
const TYPICAL: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_typical,
  span: m.vm_span_typical,
  spread: m.vm_spread_typical,
  rate: m.vm_rate_typical,
  resonance: m.vm_resonance_typical,
  room: m.vm_room_typical,
  scale: m.vm_scale_typical
};

/** Field 6: what it cannot tell you. */
const CANNOT: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_cannot,
  span: m.vm_span_cannot,
  spread: m.vm_spread_cannot,
  rate: m.vm_rate_cannot,
  resonance: m.vm_resonance_cannot,
  room: m.vm_room_cannot,
  scale: m.vm_scale_cannot
};

/** Field 7: which tier it is in, said in ordinary words. */
const TIER: Record<VoiceMetricKey, Message> = {
  pitch: m.vm_pitch_tier,
  span: m.vm_span_tier,
  spread: m.vm_spread_tier,
  rate: m.vm_rate_tier,
  resonance: m.vm_resonance_tier,
  room: m.vm_room_tier,
  scale: m.vm_scale_tier
};

export const metricName = (key: VoiceMetricKey): string => NAME[key]();

/** Stable field keys for the seven explanations in each metric section. */
type MetricField =
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
