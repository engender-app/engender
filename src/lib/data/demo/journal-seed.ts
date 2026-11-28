/* Seed the persona through real journal writes so IDs, photo files
   and search indexing match normal use (ADR-0002, ADR-0008, ADR-0005).

   Gate imports with `__DEMO__` so production builds exclude them.
   Demo state jumps use journal transactions. Cold web boot batches
   the same writes in one worker transaction. */

import type { Journal } from '../journal/journal';
import type { NormalizedPhoto } from '../journal/photos';
import { persona, type PersonaLocale } from './persona';
import { todayEpochDay } from '../epochDay';

/** Clear demo journal rows and keep preferences. Let `discardEverything`
    choose row order so new sections are included automatically.

    Remove entry and milestone photos through the journal first.
    `discardEverything` leaves files in place for restore rollback.
    The persona attaches no other files. The orphan sweep handles any
    future demo media that this path does not remove. */
export async function clearJournal(journal: Journal): Promise<void> {
  for (const photo of await journal.photos.inJournal()) await journal.photos.remove(photo.id);
  await journal.discardEverything();
}

export async function seedPersonaJournal(
  journal: Journal,
  today: number = todayEpochDay(),
  locale: PersonaLocale = 'en'
): Promise<void> {
  await writePersonaJournal(journal, persona(today, locale));
}

/** Every seed `writePersonaJournal` will ask `makePhoto` for, one per photo
    it attaches. Photos are drawn from the seed alone, so a caller that knows
    the persona can draw them before the database is open. */
export function personaPhotoSeeds(source: ReturnType<typeof persona>): number[] {
  const seeds: number[] = [];
  for (const { photoCount, epochDay } of source.entries) {
    for (let i = 0; i < photoCount; i++) seeds.push(epochDay + i);
  }
  for (const { hasPhoto, epochDay } of source.milestones) if (hasPhoto) seeds.push(epochDay);
  for (const { epochDay } of source.documents) seeds.push(epochDay);
  return seeds;
}

export async function writePersonaJournal(
  journal: Journal,
  source: ReturnType<typeof persona>,
  makePhoto: typeof demoPhoto = demoPhoto
): Promise<void> {
  const { customTag, presentations, entries, milestones, eras, reminders, providers, appointments, waiting, documents, labResults } =
    source;

  /* What the journal held before this ran, so the check at the end reads a
     delta rather than assuming an empty journal - the callers all clear
     first, but this function is the one that knows what it wrote and it
     should not need them to. */
  const heldBefore = await journal.entries.countAll();
  let written = 0;

  await journal.tags.addTag(customTag.groupKey, customTag.label, customTag.icon);

  // Presentations before entries: an entry naming one by `presentationName`
  // needs the real id, which only exists once the row is written
  //.
  const presentationIds = new Map<string, string>();
  for (const { name, roleIndex } of presentations) {
    const created = await journal.presentations.addPresentation(name, roleIndex);
    presentationIds.set(name, created.id);
  }

  for (const { photoCount, presentationName, ...entry } of entries) {
    const entryId = await journal.entries.upsertEntry({
      ...entry,
      presentationId: presentationName ? presentationIds.get(presentationName) : undefined
    });
    written++;
    for (let i = 0; i < photoCount; i++) {
      await journal.photos.attach({ entryId }, await makePhoto(entry.epochDay + i));
    }
  }

  for (const { hasPhoto, ...milestone } of milestones) {
    const milestoneId = await journal.milestones.upsertMilestone(milestone);
    if (hasPhoto) await journal.photos.attach({ milestoneId }, await makePhoto(milestone.epochDay));
  }

  for (const era of eras) await journal.eras.upsertEra(era);

  for (const reminder of reminders) await journal.reminders.upsertReminder(reminder);

  /* The debrief is linked by the appointment's own id, the same
     link `recordDebriefEntry` makes for a person who wrote it through the
     real offer. Unlike that person, the persona has no standing prep list
     for the link to land on, which is why `recordDebriefEntry` creates the
     standalone checklist on first use (checklists.ts) rather than assuming
     one exists. */
  const providerIds = new Map<string, string>();
  for (const provider of providers) providerIds.set(provider.name, await journal.appointments.upsertProvider(provider));

  for (const { debrief, providerName, ...appointment } of appointments) {
    const appointmentId = await journal.appointments.upsertAppointment({
      ...appointment,
      providerId: providerName ? providerIds.get(providerName) ?? null : null
    });
    if (debrief) {
      const entryId = await journal.entries.upsertEntry({ epochDay: appointment.epochDay, ...debrief });
      written++;
      await journal.checklists.recordDebriefEntry(entryId, appointmentId);
    }
  }

  for (const { appointment, updates } of waiting) {
    const appointmentId = await journal.appointments.upsertAppointment(appointment);
    for (const update of updates) await journal.appointments.addStatusUpdate({ appointmentId, ...update });
  }

  for (const document of documents) await journal.documents.addDocument(document, await makePhoto(document.epochDay));

  for (const result of labResults) await journal.labs.upsertResult(result);

  /* And it is all still there. A seed that stops part way
     through throws where it stops - `upsertEntry` refusing a presentation
     something else deleted underneath it, for one - but a seed whose rows
     are removed after it wrote them finishes quietly and leaves a journal
     that is missing days nobody asked it about. The count is the cheapest
     thing that can tell the two apart from the inside. */
  const gained = (await journal.entries.countAll()) - heldBefore;
  if (gained !== written)
    throw new Error(`the demo seed wrote ${written} entries, the journal gained ${gained}`);
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
export async function demoPhoto(seed: number): Promise<NormalizedPhoto> {
  const hue = (seed * 37) % 360;
  return { full: await gradientJpeg(hue, 640), thumb: await gradientJpeg(hue, 320) };
}

async function gradientJpeg(hue: number, size: number): Promise<Uint8Array> {
  const canvas = typeof document === 'undefined'
    ? new OffscreenCanvas(size, size)
    : document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')! as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, `hsl(${hue} 45% 72%)`);
  gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 40% 55%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const blob = 'convertToBlob' in canvas
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
    : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!blob) throw new Error('the demo could not encode a photo');
  return new Uint8Array(await blob.arrayBuffer());
}
