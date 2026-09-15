/* What the size log knows that it was never saying: that a size changed
   (phase 10 redesign ticket 61).

   The screen captured `XS - H&M` and `15 July 2026 - true to size` and
   stopped there, which is a purchase log. Clothes changing size is one of
   the most legible signals a transitioning body gives, and often the one
   that lands before any number does, so the records were right and the
   framing was a receipt.

   What this answers is one statement per category and brand: the size
   worn before, the last day it was recorded, the size worn now, and the
   first day that one was. *L in November 2025, M since July 2026.*

   **Never across brands.** A letter at one label is not a letter at
   another - the fit note exists because of exactly that - so a line that
   quietly put H&M next to Levi's would be the app making a claim about a
   body off a claim about a label. A record with no brand has no label to
   be read against, so it joins no line at all; it stays in the log, where
   it is still a record of what was bought and how it fitted.

   **Never a ranking.** A change of state with its dates, the same kind of
   statement as `400 days post-op` (ADR-0012). There is no arrow here, no
   direction, no better and no worse - a size returned to reads exactly the
   same way as a size moved to, which is the test in the ticket and the
   reason `from` and `to` are named after time rather than after magnitude.
   Size is free text and a letter is not a number, so nothing here
   subtracts anything.

   Node-tier safe: no clock, no driver, no paraglide. The words and the
   dates are the screen's. */

import { GARMENT_CATEGORIES } from './garmentCategories';
import type { SizeRecord } from './types';

/** The label a line is about, as one string. Unambiguous however odd a
    brand somebody types: a separator character could appear in one, and two
    labels colliding would put two brands on one line, which is the one
    thing this file exists to refuse.

    Exported because the screen keys its rendered lines on the same thing,
    and a key the grouping and the rendering each built their own way is two
    statements of one idea waiting to disagree. */
export function sizeLabelKey(category: string, brand: string): string {
  return JSON.stringify([category, brand]);
}

/** One statement: what a category and brand were, and what they are. */
export interface SizeChange {
  category: string;
  brand: string;
  /** The size worn before, and the last day it was recorded. */
  from: { size: string; epochDay: number };
  /** The size worn since, and the first day it was recorded. */
  to: { size: string; epochDay: number };
}

/** The change line for every category and brand that has one, in the
    catalogue's own order and then by brand - the same order the log below
    draws its groups in, so a line and its records are read together.

    A category the catalogue does not know still draws its line, after the
    ones it does, for the reason `areaGroupName` keeps an unrecognised key:
    a row that arrived from outside this build's writers is shown as it is
    rather than disappearing. */
export function sizeChanges(records: readonly SizeRecord[]): SizeChange[] {
  const byLabel = new Map<string, SizeRecord[]>();
  for (const record of records) {
    const brand = record.brand.trim();
    if (!brand) continue;
    const key = sizeLabelKey(record.category, brand);
    const group = byLabel.get(key);
    if (group) group.push(record);
    else byLabel.set(key, [record]);
  }

  const changes: SizeChange[] = [];
  for (const group of byLabel.values()) {
    const change = changeOf(group);
    if (change) changes.push(change);
  }

  return changes.sort(
    (a, b) => catalogueIndex(a.category) - catalogueIndex(b.category) || a.brand.localeCompare(b.brand)
  );
}

/** The last two sizes of one category and brand, or null while there has
    only ever been one.

    Only the last two, however many came before: the line says where the
    person is and what they were last, not a history, which is what the log
    under it already is. */
function changeOf(group: readonly SizeRecord[]): SizeChange | null {
  /* By day, and by the order they arrived within a day - two sizes logged
     on one date are still one after the other, and a sort that reordered
     them would invent a change that runs backwards. `sort` is stable, so
     leaving equal days alone is the whole of it. */
  const worn = [...group].sort((a, b) => a.epochDay - b.epochDay);

  const last = worn[worn.length - 1];
  const to = last.size.trim();

  /* The first day of the run the person is in now, walking back while the
     size is unchanged, and then the last day of the run before it. */
  let i = worn.length - 1;
  while (i > 0 && worn[i - 1].size.trim() === to) i--;
  if (i === 0) return null;

  const before = worn[i - 1];
  return {
    category: last.category,
    brand: last.brand.trim(),
    from: { size: before.size.trim(), epochDay: before.epochDay },
    to: { size: to, epochDay: worn[i].epochDay }
  };
}

function catalogueIndex(category: string): number {
  const index = (GARMENT_CATEGORIES as readonly string[]).indexOf(category);
  return index === -1 ? GARMENT_CATEGORIES.length : index;
}
