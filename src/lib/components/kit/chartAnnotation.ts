/* How an annotation is written (phase 5 deepening ticket 23).

   The selection rule is in $lib/charts/annotations.ts, which stays Node-tier
   safe and so imports no paraglide (ADR-0016). The words are here, beside the
   component that draws them, which is the same split day.ts keeps from
   vocabulary/dayLabels.ts and BarRows.svelte from barRow.ts.

   Descriptive only (PRODUCT.md:109). An annotation names a thing and a date.
   None of these strings says a reading moved, rose, fell or responded, and
   none of them puts an event and a value in the same sentence: a label that
   read "estradiol started, dysphoria down" would be the causal claim the
   ticket rules out, written by the label rather than by the data. */

import { m } from '$lib/paraglide/messages';
import { fmtDay } from '$lib/data/dates';
import type { ChartAnnotation, ChartAnnotationKind } from '$lib/charts/annotations';

/** What each kind of thing is called, for a record that carries no name of
    its own and to say which sort of thing a named one is.

    A record rather than an if-cascade, and keyed by the kind so it is total:
    an eighth kind is a compile error here. A cascade ending in a bare return
    would have labelled it a tryout instead, silently and in two languages. */
const KIND_WORD: Record<ChartAnnotationKind, () => string> = {
  milestone: m.chart_annotation_milestone,
  surgery: m.chart_annotation_surgery,
  regimen: m.chart_annotation_regimen,
  recovery: m.chart_annotation_recovery,
  dosePause: m.chart_annotation_dose_pause,
  journalingPause: m.chart_annotation_journaling_pause,
  tryout: m.chart_annotation_tryout
};

function kindWord(kind: ChartAnnotationKind): string {
  return KIND_WORD[kind]();
}

/** The short form, for the caption under a plot where two of these have to
    fit across 390px: what the record calls itself, and the kind of thing it
    is only where it calls itself nothing.

    Recovery is the one kind that cannot go by its name alone. It takes the
    name of the procedure it follows, and the procedure's own surgery day is
    an annotation too, so a caption listing both wrote "top surgery, top
    surgery" and looked like a bug in the query rather than two marks that
    mean different things. */
export function annotationName(annotation: ChartAnnotation): string {
  const name = annotation.name?.trim();
  if (!name) return kindWord(annotation.kind);
  return annotation.kind === 'recovery' ? m.chart_annotation_recovery_of({ name }) : name;
}

/** The long form, for the readout and for the list a screen reader takes.
    "estradiol, regimen" rather than "estradiol": which sort of thing a name
    belongs to is visible from the mark on a chart and is not visible at all
    to somebody reading the list instead. */
export function annotationLabel(annotation: ChartAnnotation): string {
  const name = annotation.name?.trim();
  const word = kindWord(annotation.kind);
  return name ? m.chart_annotation_named({ name, kind: word }) : word;
}

/** One line of the list under the chart: what it was, and when.

    Dates are written here rather than by each screen because this is the one
    place they are written for an annotation - the division of labour the
    chart itself keeps for `from`, `to` and `scrubLabel` is between a screen
    and a component, and this is the component's own side of it. */
export function annotationLine(annotation: ChartAnnotation): string {
  const short = { day: 'numeric', month: 'short' } as const;
  const label = annotationLabel(annotation);
  if (annotation.shape === 'point') {
    return m.chart_annotation_point({ label, day: fmtDay(annotation.fromEpochDay, short) });
  }
  return m.chart_annotation_span({
    label,
    from: fmtDay(annotation.fromEpochDay, short),
    to: fmtDay(annotation.toEpochDay, short)
  });
}

/** How many names the caption writes before it stops naming them. Three fits
    across a card at 390px; a fourth wraps the caption onto a third line and
    the chart starts being framed by its own footnote. */
const CAPTION_NAMES = 3;

/** How many the scrub readout writes. Fewer, because the readout is a pill
    over a 132px plot rather than a line under it: a day inside a regimen, a
    dose pause, a recovery window and a tryout would otherwise stack four
    lines of it over the chart it is annotating - and a gathered mark is
    exactly where that happens. */
const READOUT_LABELS = 2;

/** What the readout writes at one position: the first couple in full, and a
    count for the rest. */
export function annotationReadout(annotations: readonly ChartAnnotation[]): {
  labels: string[];
  rest: number;
} {
  return {
    labels: annotations.slice(0, READOUT_LABELS).map(annotationLabel),
    rest: Math.max(annotations.length - READOUT_LABELS, 0)
  };
}

/** The caption under the plot: what is in view, named, with a count for the
    rest. Empty where there is nothing in view, so a chart with no annotations
    in its range draws no caption rather than an empty line. */
export function annotationCaption(annotations: readonly ChartAnnotation[]): string {
  if (annotations.length === 0) return '';
  const names = annotations.slice(0, CAPTION_NAMES).map(annotationName);
  const rest = annotations.length - names.length;
  const listed = names.join(', ');
  return rest > 0 ? m.chart_annotations_more({ names: listed, count: String(rest) }) : listed;
}
