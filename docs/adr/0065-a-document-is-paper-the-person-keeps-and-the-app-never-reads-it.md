# A document is paper the person keeps, and the app never reads it

Status: Accepted
Decided: 2026-09-05
Last reviewed: 2026-11-02
Supersedes: none

A transition generates paper: an opinion, a diagnosis, a court ruling, a
referral, a carry letter, an invoice. The journal holds those files beside
the photos, under the same data key.

**PDFs and images, nothing else.** An image goes through the photo path and
gets ADR-0008's metadata strip. A PDF is stored as it arrived. Any other
file is refused with one line naming what is accepted. Ceiling: 25 MB per
file (`DOCUMENT_SIZE_CEILING`).

**The app never reads a document's contents.** No text extraction or
full-text search over what a document says. Search finds a document by the
title the person wrote. The viewer renders pages as images with no text
layer.

**One flat dated record with an optional link.** A date, a title, the file,
and at most one link to a roadmap goal or institution, a milestone, a
procedure or a regimen episode. No folders, tags or categories. When a
linked target is deleted the link becomes null and the document survives.

**The list shows a small thumbnail of the page's top, and the full page
only on a document's own screen.** Each row shows the thumbnail
(`DocumentThumb.svelte`), title, date and link. A PDF the renderer cannot
read falls back to a kind mark.

## Why

This is the most sensitive data the person carries, and the store exists
because the alternative is a diagnosis PDF in a phone's Downloads folder.

**No reading of contents.** The app already refuses to interpret a lab
value, and a court ruling is further from its competence. Indexing it would
put the words of a diagnosis in a search index. The title is the person's
own summary and the right granularity for finding something again.

**No text layer.** It is where most of a PDF renderer's weight lives and a
capability pointed at the line above.

**A bundled renderer, not the OS viewer.** Handing bytes to another app
writes a decrypted file into shared storage. `object-src 'none'` and
`frame-src 'none'` rule out an embedded native viewer for the same reason.

**The thumbnail.** The list first drew one paper glyph per row, so telling
two documents apart meant opening both. A thumbnail of a letterhead and a
shape is not a readable document, and the list never drew the full page.
Disguise stops at unlock (ADR-0101), and ADR-0063 rules out a per-document
hide flag, so layout is the remaining lever: the readable page waits for a
tap.

**One link, not many.** The roadmap has a step about keeping opinions and
nowhere to keep them, so the link is not decoration. A document filed under
several things is a filing system, which is the vault this decision avoids.
Institutions file documents through the goal link kind, not a fifth kind
(ADR-0068).

## Consequences

Documents are an area in the full sense (ADR-0027): an archive section, a
`live/writes.ts` classification, a day-view section so a 1994 document sits
in 1994, and a title-only search entry. They join `NOT_FINISHABLE` in
`src/lib/data/areaState.ts`, since paper keeps arriving. They are not a
clinician-summary section. `travels: 'none'` for structure files.

Two hand-written places must know about the table or it breaks silently:
the orphan sweep, which enumerates binary tables by name and otherwise
leaks every deleted file, and the archive's file manifest, otherwise
documents travel as rows with no bytes.

The PDF renderer loads when someone opens a document, outside the shell
precache, so a first offline PDF can fail on the missing worker and
standard fonts. Android packages them. The build target follows the
WebView floor (ADR-0023); pdf.js is Apache-2.0. On Android documents are
picked through `ACTION_OPEN_DOCUMENT` with an explicit MIME list.

## Considered and rejected

- **A vault with folders, tags or notes.** Every filing system grows a
  taxonomy the person then maintains.
- **OCR over documents.** The engine exists for lab photos, and pointing it
  at a ruling indexes a diagnosis.
- **The OS viewer or an intent.** Both write plaintext outside the boundary.
- **Arbitrary files.** The app becomes a file manager. Widening later costs
  nothing, narrowing costs somebody their file.
- **A per-document sensitivity flag.** ADR-0063 forbids it.

History: decided 2026-09-05; PDF asset loading added; list thumbnails 2026-09-17, restored 2026-11-02; disguise clause moved to ADR-0101 2026-11-02.