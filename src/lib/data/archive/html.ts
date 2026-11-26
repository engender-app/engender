/* HTML to text, for imported note bodies.

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

/* Every pass below is one left-to-right scan. The regexes they replace
   (`<[^>]*>`, a lazy `[\s\S]*?` up to a closing tag, `[ \t]+\n`) restart
   from every candidate start, so a note of repeated unmatched `<script>` or
   `<` openers, or a long run of spaces, took quadratic time: a few
   kilobytes stalled the preview for seconds, a megabyte for minutes. The
   scans keep the regexes' meaning, and the passes still run in the same
   order, each over the previous one's output. */

/** A replacement for `[from, resume)` of the text being scanned. */
type Edit = { text: string; resume: number };

/** Apply `rule` at every `<` that has a `>` somewhere after it, as
    `/<[^>]*>/g` would find tags: a tag runs from its `<` to the next `>`.
    The next `>` is remembered, so a run of `<` with none after it costs one
    search, not one each. A rule returns null to leave that `<` alone. */
function scanTags(text: string, rule: (at: number, end: number) => Edit | null): string {
  let out = '';
  let copied = 0;
  let end = -1;
  for (let at = text.indexOf('<'); at !== -1; at = text.indexOf('<', at + 1)) {
    if (end < at) {
      end = text.indexOf('>', at);
      if (end === -1) break;
    }
    const edit = rule(at, end);
    if (!edit) continue;
    out += text.slice(copied, at) + edit.text;
    copied = edit.resume;
    at = edit.resume - 1;
  }
  return out + text.slice(copied);
}

const sticky = (pattern: RegExp, text: string, at: number): RegExpExecArray | null => {
  pattern.lastIndex = at;
  return pattern.exec(text);
};

const OPEN_CODE = /<(script|style)\b/iy;
const OPEN_LI = /<li\b/iy;
const BR = /<br\s*\/?>/iy;
const BLOCK_CLOSE = /<\/(?:p|div|ul|ol|h[1-6]|blockquote)\s*>/iy;

/** Elements whose content is code rather than text: dropped whole, so a
    stray `<script>` in a note body does not arrive as its own source. An
    opener with no closing tag is left for the tag pass, which strips the
    tag and keeps the words. A closer missing from some point on is missing
    for every later opener of that name, so each name is searched to the end
    of the text at most once. */
function dropCodeBodies(text: string): string {
  const closers = new Map<string, RegExp | null>();
  return scanTags(text, (at, end) => {
    const open = sticky(OPEN_CODE, text, at);
    if (!open) return null;
    const name = open[1].toLowerCase();
    let closer = closers.get(name);
    if (closer === undefined) closers.set(name, (closer = new RegExp(`</${name}\\s*>`, 'gi')));
    if (!closer) return null;
    closer.lastIndex = end + 1;
    const found = closer.exec(text);
    if (!found) {
      closers.set(name, null);
      return null;
    }
    return { text: '', resume: found.index + found[0].length };
  });
}

/** `[ \t]+\n` becomes `\n`: blanks before a line break are dropped. */
function trimLineEnds(text: string): string {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    let end = lines[i].length;
    while (end > 0 && (lines[i][end - 1] === ' ' || lines[i][end - 1] === '\t')) end--;
    lines[i] = lines[i].slice(0, end);
  }
  return lines.join('\n');
}

export function htmlToText(html: string): string {
  // A list item keeps its marker: an imported checklist that arrived as
  // one run-on line would have lost what it was.
  const items = replaceAt(dropCodeBodies(html), OPEN_LI, '\n- ');
  const breaks = replaceAt(items, BR, '\n');
  // No `</li>` here: the opening tag above already broke the line, and
  // breaking on both would put a blank line between every two items.
  const blocks = replaceAt(breaks, BLOCK_CLOSE, '\n');
  const text = scanTags(blocks, (at, end) => ({ text: '', resume: end + 1 }));

  return trimLineEnds(decodeEntities(text))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Replace the tag starting at each `<` that `pattern` matches there. The
    `<li` case has no closing `>` in its pattern, so it spans to the next
    `>` as `<li\b[^>]*>` does. */
function replaceAt(text: string, pattern: RegExp, replacement: string): string {
  return scanTags(text, (at, end) => {
    const found = sticky(pattern, text, at);
    if (!found) return null;
    return { text: replacement, resume: pattern === OPEN_LI ? end + 1 : found.index + found[0].length };
  });
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
