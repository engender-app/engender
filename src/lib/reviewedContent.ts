/* Shipped reference content and the day a person last checked it
   (functional audit ticket 40).

   Some of what the app ships is other people's facts: phone numbers and
   opening hours, Polish court procedure, figures read out of papers and
   guides. Those rot without anything in the code changing. A helpline cuts
   its hours, a statute moves, a guideline is revised. Each owner already
   records a reviewed-on day beside its content; this file collects them in
   one list and says when each falls due, so a release can warn about
   anything nobody has re-read in time.

   The limits are the functional audit's: six months for helpline and legal
   content, which changes without notice, and 24 months for literature
   figures, which change when a paper or a guideline does.

   scripts/check-reviewed-content.mjs runs this in the release workflow and
   warns. It never fails a release, because a stale date means "go and
   read the source again", not "this is wrong".

   To register new content, export its reviewed-on day next to the content
   and add a row below. A row is one date: when an area records one date per
   item (the onset bands do), map its items to one row each. */

import { ROADMAP_PACKS } from './data/roadmap';
import { VOICE_METRICS_REVIEWED_ON } from './data/voice/metrics';
import { WEAR_SAFETY_REVIEWED_ON } from './data/journal/wearSessions';
import { RESOURCES_REVIEWED_ON } from './resources/directory';

export type ReviewedKind = 'helpline' | 'legal' | 'literature';

export const REVIEW_LIMIT_MONTHS: Record<ReviewedKind, number> = { helpline: 6, legal: 6, literature: 24 };

export interface ReviewedContent {
  /** Where it ships, named the way a person finds it in the app. */
  area: string;
  /** What inside the area this date covers. */
  item: string;
  kind: ReviewedKind;
  /** The ISO day a person last read it against its source. */
  reviewedOn: string;
}

export const REVIEWED_CONTENT: readonly ReviewedContent[] = [
  { area: 'Resources', item: 'every number, address and opening time', kind: 'helpline', reviewedOn: RESOURCES_REVIEWED_ON },
  /* The Polish pack holds the court procedure and the institutions to update
     after the ruling, so its one date covers the institution list too. */
  ...ROADMAP_PACKS.map((pack) => ({ area: 'Roadmap', item: `${pack.key} pack`, kind: 'legal' as const, reviewedOn: pack.reviewedOn })),
  { area: 'Voice', item: 'figures on the metric reference screen', kind: 'literature', reviewedOn: VOICE_METRICS_REVIEWED_ON },
  { area: 'Wear', item: 'safety facts and the binder cue hours', kind: 'literature', reviewedOn: WEAR_SAFETY_REVIEWED_ON }
];

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The last day `entry` is within its limit, as an ISO day, or null when
    its reviewed-on value is not a real ISO day. A review on the 31st falls
    due on the last day of a shorter month rather than spilling into the
    next one. */
export function reviewDueOn(entry: ReviewedContent): string | null {
  const match = ISO_DAY.exec(entry.reviewedOn);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const reviewed = new Date(Date.UTC(year, month - 1, day));
  if (reviewed.getUTCMonth() !== month - 1 || reviewed.getUTCDate() !== day) return null;
  const monthIndex = month - 1 + REVIEW_LIMIT_MONTHS[entry.kind];
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/** Every entry past its limit on `today` (an ISO day), with the day it fell
    due. An entry whose date cannot be read is always included, with a null
    due day, since nobody can say when it was checked. */
export function staleContent(
  entries: readonly ReviewedContent[],
  today: string
): (ReviewedContent & { dueOn: string | null })[] {
  return entries.flatMap((entry) => {
    const dueOn = reviewDueOn(entry);
    return dueOn === null || today > dueOn ? [{ ...entry, dueOn }] : [];
  });
}
