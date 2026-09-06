/* The paper a transition generates (phase 8 features ticket 52, ADR-0065,
   CONTEXT: "Document"): an opinion, a diagnosis, a court ruling, a referral,
   a carry letter. Held beside the photos, under the same data key, because
   the alternative is that file sitting in a phone's Downloads folder.

   Flat, so its three writes come from flatArea.ts and only the reads are its
   own - and with them ADR-0053's delete contract by construction. The record
   is a day, a title, a stored file, and (ticket 56) an optional link to a
   goal, a milestone, a procedure or an episode.

   The link travels as two flat columns, `targetKind`/`targetId`, rather than
   one nested field: `flatArea` maps one domain field to one column with no
   join to offer (flatArea.ts's own header), the same reason `milestone`'s
   `procedureId`/`tryoutId` are flat fields on `Milestone` rather than a
   nested owner. `documentTarget()` below is the combined read a caller
   wants instead of the two apart.

   The link is nulled by the two deletes that can reach it - `deleteMilestone`,
   `deleteProcedure` - each running a cross-table UPDATE before its own row's
   DELETE, the same order those two already use for `milestone.procedure_id`/
   `tryout_id`. A regimen episode and a roadmap goal have no delete to null it
   from (regimen.ts: "episodes are never deleted"; provenance.ts: "nothing can
   delete a roadmap goal today"), so a link to either cannot dangle in
   practice today - schema v77's own comment says the same.

   **The app never reads a document.** No OCR, no text extraction, nothing
   about what the page says (ADR-0065). That is why there is no method here
   that returns anything but the fields somebody typed, and why the search
   registry matches this area on `title` alone.

   **Files before rows, rows before files are forgotten.** The same ordering
   rule photos.ts states in full, for the same reason: `addDocument` writes
   both files and then inserts the row, `deleteDocument` deletes the row and
   then the files. A crash in either gap leaves a file no row references -
   which `sweepOrphanPhotos` reclaims on the next boot, and which is why
   `document` had to be added to the list of tables that sweep reads - never
   a row pointing at a file that is not there.

   An image is normalised on the way in by the existing path
   (photos/normalize.ts), which is what strips its metadata (ADR-0015) and
   produces the thumbnail the document's own screen draws, and gets the
   same opaque `<uuid>.jpg` a photo carries (photos/names.ts). A PDF
   (ticket 53, ADR-0065) cannot go through that path - canvas normalisation
   is image-only - so it is stored exactly as it arrived, as `<uuid>.pdf`.
   That extension is this module's own doing, never trusted from the file
   that arrived, and it is what tells the two kinds apart afterwards.

   Both kinds have a thumbnail beside them: an image's falls out of
   normalisation, and a PDF's is its first page drawn once at import
   (ticket 55, documents/pdf.ts). The names differ only in what they are
   derived from, which `documentThumbName` below owns so that the sweep,
   the archive and the screen cannot each have their own idea of it. A PDF
   the renderer could not read has no thumbnail file at all, and every one
   of those readers already treats a missing file as nothing to show
   rather than as an error. */

import type { SqliteDriver } from '../sqlite/driver';
import type { DocumentTarget, JournalDocument } from '../types';
import { filesOf, photoFileName, thumbFileName } from '../photos/names';
import type { PhotoFileStore } from '../photos/photo-file-store';
import type { DocumentFile } from '../documents/accept';
export type { DocumentFile } from '../documents/accept';
import { flatArea } from './flatArea';
import { assertChanged, mintUuid, now } from './support';

/** Whether a document's stored file is a PDF rather than an image - read
    off the extension `addDocument` mints below, never off anything the
    picker claimed. It decides which renderer a screen needs and how the
    thumbnail beside it is named. */
export const isPdfDocument = (fileName: string): boolean => fileName.endsWith('.pdf');

/** The name of the thumbnail stored beside a document. A photo's is
    `photos/names.ts`'s `.jpg` rewrite; a PDF's is the same shape spelled
    off a `.pdf`, because that rewrite only matches a `.jpg` suffix and
    would otherwise hand back the document's own name - which is how a
    reader ends up decoding a whole PDF as if it were a JPEG. */
export const documentThumbName = (fileName: string): string =>
  isPdfDocument(fileName) ? fileName.replace(/\.pdf$/, '-thumb.jpg') : thumbFileName(fileName);

/** Every file one document row owns. Shared by `deleteDocument` below and
    by the orphan sweep and the archive's file manifest (photos.ts,
    archive.ts), which both own a document row's files without owning the
    area itself - and both of which are content to name a thumbnail that
    was never written, since a missing file is nothing to delete and
    nothing to pack. */
export const documentFilesOf = (fileName: string): string[] => [fileName, documentThumbName(fileName)];

/** What a person types when they file a piece of paper: the day it is from,
    and their own name for it. The file arrives beside this rather than in
    it, because bytes are not a field of the record. */
export interface DocumentInput {
  epochDay: number;
  title: string;
}

export interface DocumentsArea {
  /** Newest first, which is the order the list screen draws them in. */
  getDocuments(): Promise<JournalDocument[]>;
  /** One document, or null - the document's own screen is addressed by id
      and has to be able to say the row has gone. */
  getDocument(id: string): Promise<JournalDocument | null>;
  /** One day's documents, oldest row first (day.ts). A diagnosis dated 1994
      shows in 1994, which is the whole point of the day being the paper's
      rather than the import's. */
  getDocumentsOnDay(epochDay: number): Promise<JournalDocument[]>;
  /** The day of the most recent document at or before `todayEpochDay`, or
      null if there is none (lastWrite.ts). */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Stores the file and returns the document's id. Refuses a blank title
      before anything is written. `content` is whatever `acceptDocumentFile`
      (documents/accept.ts) already decided the picked bytes are - this
      never re-reads them, so a document is never refused twice. */
  addDocument(input: DocumentInput, content: DocumentFile): Promise<string>;
  /** Corrects a title or a day. Takes the whole record rather than the two
      editable fields, so the file it names travels with it and this shares
      `flatArea`'s upsert instead of writing a second UPDATE beside it.
      Throws on an unknown id (ADR-0053). */
  updateDocument(document: JournalDocument): Promise<void>;
  /** Idempotent, like the journal's other deletes (ADR-0053), and it takes
      the stored file and its thumbnail with it. */
  deleteDocument(id: string): Promise<void>;
  /** Documents whose link names this exact (kind, id) pair, newest first -
      what a target's own screen draws under "documents pointing here".
      Reads only: the target stores nothing (ADR-0065). */
  getDocumentsLinkedTo(kind: DocumentTarget['kind'], id: string): Promise<JournalDocument[]>;
  /** Sets or clears a document's link. `null` clears it - as cheap as
      setting one (ADR-0065). Throws on an unknown document id (ADR-0053),
      the same as `updateDocument`. */
  setDocumentTarget(id: string, target: DocumentTarget | null): Promise<void>;
}

/** `document.targetKind`/`targetId` combined, or null when either is - which
    by the schema CHECK means both are. Pure, no driver: every screen that
    wants "what is this linked to" wants the pair together, not the two flat
    fields apart. */
export function documentTarget(document: JournalDocument): DocumentTarget | null {
  const { targetKind, targetId } = document;
  return targetKind !== null && targetId !== null ? { kind: targetKind, id: targetId } : null;
}

/** The title as it will be stored, or a throw.

    A title is the only handle anything has on a document - the list shows
    it, search matches on it and nothing else, and the app never reads the
    page itself (ADR-0065). So a blank one is refused here rather than
    stored as an unfindable row, and the import sheet's own disabled save is
    the same rule said earlier.

    Not `flatArea`'s `guard` hook, which would be the obvious home for it:
    a guard is a pure check and this also trims, so putting it there would
    leave every write storing the untrimmed string it had just approved.
    Both writers call this instead - `addDocument` because it has to refuse
    before any file lands, `updateDocument` because a correction is as
    capable of blanking a title as an import is. */
function titled(title: string): string {
  const trimmed = title.trim();
  if (trimmed === '') throw new Error('a document needs a title');
  return trimmed;
}

export function makeDocumentsArea(driver: SqliteDriver, files: PhotoFileStore): DocumentsArea {
  const documents = flatArea<JournalDocument>(driver, {
    table: 'document',
    columns: {
      epochDay: 'epoch_day',
      title: 'title',
      fileName: 'file_path',
      targetKind: 'target_kind',
      targetId: 'target_id'
    }
  });

  /** One document or none, by its travelling id. Shared by the read and the
      delete rather than the delete writing its own SELECT: the whole point
      of the flat factory is that a column list is not written twice. */
  const byId = async (id: string): Promise<JournalDocument | null> => {
    const [document] = await documents.read('WHERE uuid = ?', [id]);
    return document ?? null;
  };

  return {
    getDocuments: () => documents.read('ORDER BY epoch_day DESC, id DESC'),

    getDocument: byId,

    getDocumentsOnDay: (epochDay) => documents.read('WHERE epoch_day = ? ORDER BY id', [epochDay]),

    async lastWriteEpochDay(todayEpochDay) {
      const [latest] = await documents.read('WHERE epoch_day <= ? ORDER BY epoch_day DESC LIMIT 1', [todayEpochDay]);
      return latest?.epochDay ?? null;
    },

    async addDocument(input, content) {
      const title = titled(input.title);
      const uuid = mintUuid();

      // Files first (see the header): the row must never name a file that
      // has not landed. A failure here leaves at most one loose file, which
      // the boot sweep reclaims.
      if ('pdfBytes' in content) {
        const fileName = `${uuid}.pdf`;
        await files.write(fileName, content.pdfBytes);
        // No page where the renderer could not read the file (ticket 55).
        // The document is still filed: what it holds is the person's, and
        // it can still be written back out from its own screen.
        if (content.thumb) await files.write(documentThumbName(fileName), content.thumb);
        return documents.upsert({ epochDay: input.epochDay, title, fileName, targetKind: null, targetId: null });
      }

      const fileName = photoFileName(uuid);
      const [full, thumb] = filesOf(fileName);
      await files.write(full, content.full);
      await files.write(thumb, content.thumb);
      return documents.upsert({ epochDay: input.epochDay, title, fileName, targetKind: null, targetId: null });
    },

    async updateDocument(document) {
      await documents.upsert({ ...document, title: titled(document.title) });
    },

    async deleteDocument(id) {
      const document = await byId(id);
      await documents.delete(id);
      if (document) for (const name of documentFilesOf(document.fileName)) await files.remove(name);
    },

    getDocumentsLinkedTo: (kind, id) =>
      documents.read('WHERE target_kind = ? AND target_id = ? ORDER BY epoch_day DESC, id DESC', [kind, id]),

    /* The pair alone, by hand rather than through `flatArea.upsert`: that
       writes every column the area has, so filing a document under something
       would re-write its title, its day and its file name from whatever a
       read a moment earlier said they were. `assertChanged` on this UPDATE's
       own result is what makes an unknown id throw (ADR-0053), the same as
       every other update in the journal. */
    async setDocumentTarget(id, target) {
      const result = await driver.run(
        'UPDATE document SET target_kind = ?, target_id = ?, updated_at = ? WHERE uuid = ?',
        [target?.kind ?? null, target?.id ?? null, now(), id]
      );
      assertChanged(result, `document: ${id}`);
    }
  };
}
