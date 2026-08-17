/* Writing the persona into a real journal (ticket 08).

   The demo used to be a `DB` object in localStorage, so "load the demo" was
   an assignment. Entries live in SQLite now, and they cannot live in two
   places at once - leaving the persona in the demo store while the screens
   read the database would mean a review build with an empty app in it. So the
   persona goes through the same journal calls a real user's writes go
   through: every id is minted by the journal (ADR-0002), every photo is a
   real file (ADR-0008), and the FTS index is written by the same code that
   maintains it for real notes (ADR-0005). Search on the demo therefore proves
   something about search.

   Nothing here ships. Like the rest of `demo/`, every import of this module
   sits behind `__DEMO__`, which vite.config.ts folds to `false` in a
   production build (ticket 05).

   Not wrapped in a transaction: the journal's own writes open one each, and
   SQLite has no nested transactions. It is a few thousand statements through
   a worker, which is the price of the persona being real rows rather than a
   fixture, and it runs once per fresh demo install. */

import type { Journal } from '../journal/journal';
import type { NormalizedPhoto } from '../journal/photos';
import { persona } from './persona';

/** Deletes every journal row, leaving preferences alone. Only the demo bar's
    state jumps need this - a real Replace import is ticket 14's, behind the
    journal rather than beside it. Ordered children-first so it works whether
    or not foreign keys are enforced on this connection. */
export async function clearJournal(journal: Journal): Promise<void> {
  // Photos first and through the journal, so the files go with the rows
  // rather than being left for the next boot's sweep.
  for (const photo of await journal.photos.inJournal()) await journal.photos.remove(photo.id);
  // In batches, because the journal offers no unbounded entry read and should
  // not grow one for the demo's sake (ADR-0004).
  for (;;) {
    const batch = await journal.entries.recentDays(60);
    if (batch.length === 0) break;
    for (const entry of batch) await journal.entries.deleteEntry(entry.id);
  }
  for (const milestone of await journal.milestones.getMilestones()) {
    await journal.milestones.deleteMilestone(milestone.id);
  }
  for (const reminder of await journal.reminders.getReminders()) {
    await journal.reminders.deleteReminder(reminder.id);
  }
  for (const analyte of await journal.labs.getUsedAnalytes()) {
    for (const result of await journal.labs.getResults(analyte)) await journal.labs.deleteResult(result.id);
  }
  for (const kind of ['misgendered', 'correctly_gendered'] as const) {
    for (const event of await journal.tally.getEvents(kind)) await journal.tally.deleteEvent(event.id);
  }
  // Custom tags and groups: built-ins stay, because reconciling them is what
  // every boot does anyway and a demo without a vocabulary is not a demo.
  for (const group of await journal.tags.getTagGroups()) {
    for (const tag of group.tags) if (!tag.builtIn) await journal.tags.deleteTag(tag.id);
  }
}

export async function seedPersonaJournal(journal: Journal): Promise<void> {
  const { customTag, entries, milestones, reminders, labResults, tallyEvents } = persona();

  await journal.tags.addTag(customTag.groupKey, customTag.label);

  for (const { photoCount, ...entry } of entries) {
    const entryId = await journal.entries.upsertEntry(entry);
    for (let i = 0; i < photoCount; i++) {
      await journal.photos.attach({ entryId }, await demoPhoto(entry.epochDay + i));
    }
  }

  for (const { hasPhoto, ...milestone } of milestones) {
    const milestoneId = await journal.milestones.upsertMilestone(milestone);
    if (hasPhoto) await journal.photos.attach({ milestoneId }, await demoPhoto(milestone.epochDay));
  }

  for (const reminder of reminders) await journal.reminders.upsertReminder(reminder);
  for (const result of labResults) await journal.labs.upsertResult(result);
  for (const event of tallyEvents) await journal.tally.log(event);
}

/* A real JPEG rather than a row pointing at a file that is not there.

   The persona used to carry `{ fileName: null }` placeholders, which the
   photo table cannot hold: `file_path` is NOT NULL, and a row naming a
   missing file is precisely the state ADR-0008's write ordering exists to
   prevent. Faking it in the demo would mean the one place a reviewer looks at
   photos is the one place the invariant is broken.

   Drawn rather than bundled, so no image ships, and drawn at both sizes
   rather than through normalizePhoto(), which would decode and re-encode
   bytes this just encoded. The gradient is the same idea PhotoThumb's
   placeholder had: a stable hue per photo, so the grid does not look like one
   photo repeated. */
async function demoPhoto(seed: number): Promise<NormalizedPhoto> {
  const hue = (seed * 37) % 360;
  return { full: await gradientJpeg(hue, 640), thumb: await gradientJpeg(hue, 320) };
}

async function gradientJpeg(hue: number, size: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, `hsl(${hue} 45% 72%)`);
  gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 40% 55%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!blob) throw new Error('the demo could not encode a photo');
  return new Uint8Array(await blob.arrayBuffer());
}
