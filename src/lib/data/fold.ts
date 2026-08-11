/* Folded text: the searchable form of a string (CONTEXT: "Folded text").
   Lowercased, with Polish letterforms stripped - including ł, which has no
   Unicode decomposition, so NFD-based folding and FTS5's remove_diacritics
   both miss it (ADR-0005). Both the search index and the query pass
   through this same function; that is the whole guarantee, so it lives in
   its own import-free module usable on either side of the journal seam
   (the FTS index below it, tag matching above it).

   Moved verbatim from repositories/entries.ts; the extra Western European
   forms it always folded (à, ç, ê, ...) stay so search behaviour does not
   change. */

export function foldText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ąàáâä]/g, 'a')
    .replace(/[ćç]/g, 'c')
    .replace(/[ęèéêë]/g, 'e')
    .replace(/[łl]/g, 'l')
    .replace(/[ńñ]/g, 'n')
    .replace(/[óòôö]/g, 'o')
    .replace(/[śš]/g, 's')
    .replace(/[żźž]/g, 'z');
}
