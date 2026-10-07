/* The scales a picker offers, in the order every chart offers them: mood
   first, then the person's active dimensions, each with the range its
   values are read on (phase 11 ticket 07).

   One place rather than three. The Look back door derived this list once
   for every card it drew; splitting the cards into readings of their own
   would have copied it into each, and the three copies were the code
   review's one finding. Called inside a `$derived`, so a scale ticked or
   unticked in settings re-derives the list where it is read. */
import { m } from '$lib/paraglide/messages';
import { MOOD_RANGE } from './metricRange';
import { vocabulary } from './vocabulary/vocabulary';

export interface MetricChoice {
  key: string;
  name: string;
  min: number;
  max: number;
}

export function metricChoices(): MetricChoice[] {
  return [
    { key: 'mood', name: m.mood(), min: MOOD_RANGE.min, max: MOOD_RANGE.max },
    ...vocabulary.activeDimensions.map((d) => ({ key: d.key, name: d.name, min: d.min, max: d.max }))
  ];
}

/** The scale the stored preference names, or mood where it names none
    that is still ticked. */
export function shownMetric(metrics: readonly MetricChoice[]): MetricChoice {
  return metrics.find((mt) => mt.key === vocabulary.activeMetric) ?? metrics[0];
}

/** A scale's name as it reads inside a sentence rather than at the start of
    a label: "Average mood", not "Average Mood". Only the first letter goes
    down, and not when the second is a capital too, so a name that opens
    with an abbreviation ("HRT energy") keeps it. A label that starts with
    the name passes the name itself, which is why the Look back average
    takes both: English puts the name mid-sentence, Polish leads with it. */
export function nameInSentence(name: string): string {
  const [first, second] = Array.from(name);
  if (!first || (second && second !== second.toLocaleLowerCase() && second === second.toLocaleUpperCase())) return name;
  return first.toLocaleLowerCase() + name.slice(first.length);
}
