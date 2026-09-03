/* Ticket 16 (phase 8 deepening): does a killed-process draft mirror really
   make a re-save throw, and does clearing it on save fix that?

   The sequence the ticket asks to establish: remove a stored photo, save
   (the removal lands in the journal), then process death skips the
   `onDestroy` that would have cleared the localStorage mirror
   (entryDraftStore.ts). On resume, `draftMatchesRoute` re-associates the
   stale mirror with the same entry and `applyPersistedDraft` reapplies its
   `removedPhotoIds`, still naming the photo the first save already deleted.
   A re-save then sends that stale id through `entries.ts`'s
   `photosToRemove`, which throws `unknown photo: ${id}` (ADR-0053: an
   update on an unknown id throws).

   A real Android process kill cannot be timed from outside the page - by
   the time `saveEntry`'s `await journal.entries.upsertEntry(...)` resolves,
   the client-side `goto()` that unmounts the editor and clears the mirror
   runs within the same microtask chain, with no externally-reachable gap.
   What a kill actually skips is exactly one call - `draftStore.clear()` -
   so `runSequence` below skips (or makes) that same call directly rather
   than racing an unreachable timing window, then drives every other step
   (the mirror write, the save, the resume's match-and-reapply, the
   re-save) through the real functions a mounted EntryEditor.svelte calls,
   against a real driver and real OPFS. This is the only way to observe the
   precise question the ticket poses - whether `draftMatchesRoute`'s gate
   filters the sequence out - since that is a matter of the real
   routing/id identity, not of timing.

   Two runs against two independent entries in the same journal: one
   without the save-time clear (the shape before ticket 16, documenting the
   defect and that `entries.ts` still throws on a genuinely unknown id -
   nothing there changed), one with it (EntryEditor.svelte's fix, saving
   right after `upsertEntry` resolves - the shape after). */

import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { encryptedFileStore } from '../../src/lib/data/photos/encrypted-file-store.ts';
import { normalizePhoto } from '../../src/lib/data/photos/normalize.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { createEntryDraft } from '../../src/lib/data/entryDraft.ts';
import { applyPersistedDraft, draftMatchesRoute, serializeDraft } from '../../src/lib/data/entryDraftPersistence.ts';
import { localStorageEntryDraft, type EntryDraftStore } from '../../src/lib/data/entryDraftStore.ts';
import type { Journal } from '../../src/lib/data/journal/journal.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'draft-mirror-probe';

/** A real, canvas-encoded JPEG - `normalizePhoto` needs a real decoder. */
async function sourceJpeg(width: number, height: number): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#7c4fc9';
  context.fillRect(0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return new Uint8Array(await blob.arrayBuffer());
}

/** One entry, one stored photo, one removal, one save, one resume, one
    re-save - with `clearMirrorOnSave` toggling whether the save clears the
    mirror the way EntryEditor.svelte's fix does, or leaves it for `onDestroy`
    the way it worked before ticket 16. */
async function runSequence(
  journal: Journal,
  draftStore: EntryDraftStore,
  epochDay: number,
  clearMirrorOnSave: boolean
) {
  const normalized = await normalizePhoto(await sourceJpeg(200, 200));
  const entryId = await journal.entries.upsertEntry({ epochDay, mood: 3 });
  const photoId = await journal.photos.attach({ entryId }, normalized);

  // --- Mount 1: the editor opens the entry, the person removes the photo,
  //     the $effect mirrors the draft on every change (EntryEditor.svelte). ---
  const entryBeforeSave = await journal.entries.getEntry(entryId);
  const draft = createEntryDraft(entryBeforeSave!.epochDay, entryBeforeSave!);
  draft.removePhoto(0);
  await draftStore.write(serializeDraft(draft));

  // --- Save: succeeds, entries.ts really deletes the photo row. ---
  await journal.entries.upsertEntry(draft.toUpsert());
  if (clearMirrorOnSave) draftStore.clear(); // EntryEditor.svelte's fix
  const entryAfterFirstSave = await journal.entries.getEntry(entryId);
  const mirrorAfterSave = await draftStore.read();

  // --- Process death before unmount: `onDestroy(() => draftStore.clear())`
  //     never runs either way - this models exactly what it skips. ---

  // --- Resume: a fresh editor mounts for the same entry/route. ---
  const persisted = await draftStore.read();
  const matchesRoute = persisted ? draftMatchesRoute(persisted, entryId, entryBeforeSave!.epochDay) : false;
  const entryOnResume = await journal.entries.getEntry(entryId);
  const resumedDraft = createEntryDraft(entryOnResume!.epochDay, entryOnResume!);
  if (persisted && matchesRoute) applyPersistedDraft(resumedDraft, persisted);

  // --- Re-save, with no further edits. ---
  let resaveError: string | null = null;
  try {
    await journal.entries.upsertEntry(resumedDraft.toUpsert());
  } catch (error) {
    resaveError = String((error as Error)?.message ?? error);
  }

  return {
    photoGoneAfterFirstSave: (entryAfterFirstSave?.photos.length ?? -1) === 0,
    mirrorClearedBySave: mirrorAfterSave === null,
    mirrorMatchedTheResumedRoute: matchesRoute,
    staleRemovalReapplied: resumedDraft.removedPhotoIds.includes(photoId),
    resaveError,
    resaveThrewUnknownPhoto: resaveError !== null && resaveError.includes(`unknown photo: ${photoId}`)
  };
}

async function run() {
  await freshOrigin();
  const files = opfsPhotoFiles();
  const journalFiles = encryptedFileStore(files, PROBE_DATA_KEY);
  const { driver, fileOps } = createEncryptedWebSqlite('draft-mirror-probe.sqlite3', PROBE_DATA_KEY);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;
  const journal = openJournal(booted.driver, journalFiles);
  await journal.reconcileBuiltIns();

  // The mirror the real editor writes on the `journalKey` the open journal
  // hands out (entryDraftStore.ts); a probe below the keystore ceremony
  // supplies the same raw key directly (fresh-origin.ts).
  const draftStore = localStorageEntryDraft(async () => PROBE_DATA_KEY);

  const before = await runSequence(journal, draftStore, 20_000, false);
  const after = await runSequence(journal, draftStore, 20_001, true);

  return { before, after };
}

/* run.mjs drives this page headlessly and reads `publish`'s result global.
   Opened by hand on a phone instead - `adb reverse` plus Vanadium, this
   ticket's Notes on a real device and FLAG_SECURE blocking a screenshot of
   the app itself - there is no Playwright to read anything back, so the
   page has to say its own result out loud for `adb exec-out screencap` to
   read, the same way the frame-timing probe does. */
function renderSummary(result: unknown) {
  const pre = document.createElement('pre');
  pre.style.font = '14px monospace';
  pre.style.whiteSpace = 'pre-wrap';
  pre.textContent = JSON.stringify(result, null, 2);
  document.body.appendChild(pre);
}

run()
  .then((result) => {
    publish(NAME, result);
    renderSummary(result);
  })
  .catch((error) => {
    const result = { error: String((error as Error)?.message ?? error) };
    publish(NAME, result);
    renderSummary(result);
  });
