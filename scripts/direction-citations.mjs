/* Every DIRECTION.md rule, decision or motion tier cited in src, tests and
   android must exist in DIRECTION.md. The file
   was lost once, in a deleted scratch folder, while some 150 comments kept
   citing it by number.

   The citation forms in use:
   - `DIRECTION.md rule 7`, `DIRECTION rule 10`, `DIRECTION.md rules 12 to 15`,
     `DIRECTION.md rules 10 and 12`, and a bare `DIRECTION.md 6`: rules;
   - `DIRECTION.md decision 2`, `DIRECTION.md's decision 2b`, and a bare
     `DIRECTION.md 3b` (a number with a letter): decisions;
   - `DIRECTION.md tier 1`, `DIRECTION's tier 4`, `DIRECTION.md, tier 2`:
     motion tiers. A comma is read only before a named family, since
     "DIRECTION.md, 3 columns" is prose.
   A cited key resolves when DIRECTION.md has a heading that opens with it:
   `### Rule 7: ...`, `### Decision 2b: ...`, `### Tier 4: ...`. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCANNED = ['src', 'tests', 'android'];
const CITATION =
  /\bDIRECTION(?:\.md)?(?:'s)?(?: |, (?=(?:rules?|decisions?|tier) ))(?:(rules?|decisions?|tier) )?(\d+[a-z]?)(?:(?: and| to) (\d+[a-z]?))?/g;
const HEADING = /^#{2,4} (Rule|Decision|Tier) (\d+[a-z]?)\b/gm;

/** @param {string} text @returns {string[]} keys like `rule 7`, `decision 2b`, `tier 1` */
export function directionCitationsIn(text) {
  const keys = [];
  for (const m of text.matchAll(CITATION)) {
    const [, word, first, second] = m;
    const kind = word ? word.replace(/s$/, '') : /[a-z]$/.test(first) ? 'decision' : 'rule';
    const isRange = m[0].includes(' to ');
    if (second && isRange && kind === 'rule') {
      for (let n = Number(first); n <= Number(second); n++) keys.push(`rule ${n}`);
    } else {
      keys.push(`${kind} ${first}`);
      if (second) keys.push(`${kind} ${second}`);
    }
  }
  return keys;
}

/** @param {string} markdown @returns {Set<string>} */
export function directionKeys(markdown) {
  return new Set([...markdown.matchAll(HEADING)].map((m) => `${m[1].toLowerCase()} ${m[2]}`));
}

/** Every cited key with no heading behind it, as `path: key` lines.
    @param {string} root @param {string} directionPath @returns {string[]} */
export function unresolvedDirectionInRepo(root, directionPath) {
  const keys = directionKeys(readFileSync(directionPath, 'utf8'));
  const files = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const found = [];
  for (const file of files) {
    let text;
    try { text = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;
    for (const key of new Set(directionCitationsIn(text))) if (!keys.has(key)) found.push(`${file}: ${key}`);
  }
  return found;
}
