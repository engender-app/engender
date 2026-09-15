/* Words for the documents index's present reading (phase 10 redesign
   ticket 58, DIRECTION.md rule 16: "an area screen opens by saying what is
   true now"). For the documents index that is how many papers are kept
   and how much room they take. Here rather than beside documentGroups.ts
   for the reason that file's neighbours already give: this speaks
   paraglide and nothing the Node tier touches may (ADR-0016). */

import { m } from '$lib/paraglide/messages';
import { intlLocale } from '$lib/data/dates';
import { bytesToDisplaySize, type DisplaySize } from '$lib/data/journal/documentsSize';

/** A decimal for MB (6.2 MB reads better than 6 or 6.23), none for KB -
    nobody cares about the ones digit of a kilobyte figure, and localized
    either way (labContextLabel.ts's own reason: a Polish reader expects
    "6,2", not "6.2"). */
const fmtSize = ({ value, unit }: DisplaySize): string =>
  `${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: unit === 'MB' ? 1 : 0 }).format(value)} ${unit}`;

export function documentsSummaryText(count: number, totalBytes: number): string {
  return m.documents_summary({ count, size: fmtSize(bytesToDisplaySize(totalBytes)) });
}
