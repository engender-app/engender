/* A ListRow that holds a switch has to be static (release blockers 09,
   accessibility audit A01).

   ListRow renders a button unless it is told it is a link, a checkbox or
   static, and Switch is a button too. A switch in the trailing slot of a
   default row is a button inside a button: axe's nested-interactive, and a
   row that Tab stops on twice while only one of the two stops does
   anything. The audit found it on the share picker and the onboarding
   disguise step; this reads every screen rather than those two, so a new
   row written the old way fails here before an audit has to find it.

   A source read, because which ListRows hold a switch is a fact about the
   templates and nothing at runtime enumerates them. The rendered half,
   that a static row holding a switch gives Tab one stop and Space one
   change, is in tests/browser-tier/run.mjs. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The end of an opening tag, skipping `>` inside `{...}` expressions. */
function tagEnd(source: string, from: number): number {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

type Row = { file: string; line: number; isStatic: boolean; holdsSwitch: boolean };

/** Every non-self-closing ListRow in a file with the markup between its tags,
    pairing nested rows by depth rather than taking the first closing tag. */
function listRows(file: string, source: string): Row[] {
  const rows: Row[] = [];
  const stack: { start: number; bodyStart: number; isStatic: boolean }[] = [];
  const token = /<ListRow\b|<\/ListRow>/g;
  for (let m = token.exec(source); m; m = token.exec(source)) {
    if (m[0] === '</ListRow>') {
      const open = stack.pop();
      if (!open) continue;
      rows.push({
        file,
        line: source.slice(0, open.start).split('\n').length,
        isStatic: open.isStatic,
        holdsSwitch: /<Switch\b/.test(source.slice(open.bodyStart, m.index))
      });
      continue;
    }
    const end = tagEnd(source, m.index);
    const tag = source.slice(m.index, end + 1);
    if (tag.endsWith('/>')) continue;
    stack.push({ start: m.index, bodyStart: end + 1, isStatic: /\sstatic(\s|>|$|=\{\s*true\s*\})/.test(tag) });
    token.lastIndex = end + 1;
  }
  return rows;
}

function svelteFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src', 'tests'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.svelte'));
}

describe('a ListRow holding a switch', () => {
  it('finds the rows it is about, so an empty scan cannot pass', () => {
    const holding = svelteFiles().flatMap((f) => listRows(f, readFileSync(f, 'utf8'))).filter((r) => r.holdsSwitch);
    /* The share picker's two, the disguise step, Settings' security row,
       the journal book's parts, the care curve's fit and Today's editor all
       write one. A count this low means the parser stopped seeing them. */
    expect(holding.length).toBeGreaterThanOrEqual(8);
  });

  it('is static everywhere, so the switch is the row\'s only control', () => {
    const offenders = svelteFiles()
      .flatMap((f) => listRows(f, readFileSync(f, 'utf8')))
      .filter((r) => r.holdsSwitch && !r.isStatic)
      .map((r) => `${r.file}:${r.line}`);
    expect(offenders).toEqual([]);
  });
});
