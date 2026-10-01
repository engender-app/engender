/* Git merge driver for messages/*.json (phase 12 copy-tooling ticket 02).
   Sorting the catalogues (ticket 01) leaves one common conflict: two branches
   adding different keys under the same prefix, side by side, which a line
   merge calls a conflict. This merges by key instead, and writes through the
   catalogue serializer so the result is always sorted.

   Wired by .gitattributes; each clone opts in once, see the README. Without
   the config git falls back to a line merge. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serializeCatalogue } from './catalogue.mjs';

/** A value is a string or a variant array; compared whole, never per variant. */
const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge per key. A key changed (added, edited, deleted) on one side
 * only takes that side; the same change on both is fine; a key changed
 * differently on both is a conflict, and the merged catalogue keeps ours.
 *
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} ours
 * @param {Record<string, unknown>} theirs
 * @returns {{ merged: Record<string, unknown>, conflicts: string[] }}
 */
export function mergeCatalogues(base, ours, theirs) {
  /** @type {Record<string, unknown>} */
  const merged = {};
  /** @type {string[]} */
  const conflicts = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
    const [b, o, t] = [base[key], ours[key], theirs[key]];
    let value = o;
    if (same(o, t) || same(b, t)) value = o;
    else if (same(b, o)) value = t;
    else conflicts.push(key);
    if (value !== undefined) merged[key] = value;
  }
  return { merged, conflicts: conflicts.sort() };
}

/** git hands an added-on-both-sides file an empty base. */
const read = (/** @type {string} */ path) => {
  const text = readFileSync(path, 'utf8');
  return text.trim() === '' ? {} : JSON.parse(text);
};

/**
 * `node merge-catalogue.mjs %O %A %B %P`: writes the result over %A and exits
 * 1 when keys conflict, naming them on stderr.
 */
function main(/** @type {string[]} */ [basePath, oursPath, theirsPath, name = oursPath]) {
  const { merged, conflicts } = mergeCatalogues(read(basePath), read(oursPath), read(theirsPath));
  writeFileSync(oursPath, serializeCatalogue(merged));
  if (conflicts.length === 0) return 0;
  console.error(`${name}: changed differently on both sides, kept ours for: ${conflicts.join(', ')}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
