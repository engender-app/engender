/* How the documents index groups its rows (phase 10 redesign ticket 58):
   by what a document is filed under, four kinds in the order the target
   picker's own sections use (documentTargets.svelte.ts), with everything
   unfiled gathered last under its own bucket rather than first or
   scattered among the named ones - the named groups are what somebody
   recognises a paper by, and the leftover is what is left once those are
   named.

   Pure and Node-testable (ADR-0016): grouping only needs a document's own
   `targetKind`, never the target's name, so it does not touch the four
   live reads `documentTargets.svelte.ts` wires for that. Newest-first
   within a group falls out for free - `documents.ts`'s own `getDocuments`
   already hands rows in that order, and this is a stable partition that
   never reorders what lands in a bucket. */

import type { DocumentTargetKind, JournalDocument } from '../types';

export type DocumentGroupKind = DocumentTargetKind | 'unattached';

export interface DocumentGroup {
  kind: DocumentGroupKind;
  documents: JournalDocument[];
}

const KIND_ORDER: DocumentTargetKind[] = ['milestone', 'procedure', 'episode', 'goal'];

/** A group per kind that holds at least one document, in `KIND_ORDER`, with
    'unattached' last - dropped entirely, the same as the picker's own
    `orderedSections`, when a kind (or the leftover bucket) would be
    empty. */
export function groupDocumentsByTarget(documents: JournalDocument[]): DocumentGroup[] {
  const byKind = new Map<DocumentGroupKind, JournalDocument[]>();
  for (const document of documents) {
    const kind: DocumentGroupKind = document.targetKind ?? 'unattached';
    const bucket = byKind.get(kind);
    if (bucket) bucket.push(document);
    else byKind.set(kind, [document]);
  }

  const groups: DocumentGroup[] = [];
  for (const kind of KIND_ORDER) {
    const bucket = byKind.get(kind);
    if (bucket) groups.push({ kind, documents: bucket });
  }
  const unattached = byKind.get('unattached');
  if (unattached) groups.push({ kind: 'unattached', documents: unattached });
  return groups;
}
