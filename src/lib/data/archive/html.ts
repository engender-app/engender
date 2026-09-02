/* HTML to text, for imported note bodies (phase 7 ticket 09).

   Daylio stores an entry's note as HTML, and only a small minority of
   notes contain any markup - which is exactly why this exists. A reader
   that treated the field as plain text would look right on almost every
   note in a journal and quietly mangle the handful someone bothered to
   format, so the conversion is not optional and the tests for it are not
   theoretical.

   Deliberately not a parser and deliberately not the DOM. Node-tier tests
   have no `DOMParser`, and `innerHTML` on a detached element would run an
   HTML parser over a stranger's file to recover text this handles with a
   few substitutions. Nothing here executes, loads or resolves anything.

   The order matters: tags come out before entities go in. Decoding first
   would turn a note whose author wrote "&lt;b&gt;" into a tag that the
   next step then strips, deleting the person's own words. */

/** Elements whose content is code rather than text: dropped whole, so a
    stray `<script>` in a note body does not arrive as its own source. */
const CODE_BODY = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Named entities Daylio's editor actually emits. Numeric forms are
    handled separately, and anything else is left as the person typed it -
    a half-decoded "&percnt;" would be a worse answer than the literal. */
const NAMED = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' ']
]);

export function htmlToText(html: string): string {
  const text = html
    .replace(CODE_BODY, '')
    // A list item keeps its marker: an imported checklist that arrived as
    // one run-on line would have lost what it was.
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    // No `</li>` here: the opening tag above already broke the line, and
    // breaking on both would put a blank line between every two items.
    .replace(/<\/(p|div|ul|ol|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');

  return decodeEntities(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED.get(body.toLowerCase()) ?? whole;
  });
}
