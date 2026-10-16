/* Export & import's last-backup mark (last-audit UI 54), at the level a
   grep can hold. Which standing a journal is in is backupHealth.test.ts's
   question; this is the wiring a typecheck cannot see. The row used to take
   its tick from a bare `{:else}` after the stale branch, so a journal never
   exported, which is not stale either, showed "No export recorded on this
   device" beside a success tick. What the row paints in each standing, and
   how the marks fade, was measured per frame on a demo build for the ticket;
   the browser checks do not drive this row. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const screen = readFileSync(root + 'src/routes/settings/export/+page.svelte', 'utf8');
const script = screen.match(/<script lang="ts">([\s\S]*?)<\/script>/)?.[1] ?? '';
const slot = screen.split('<span class="backup-mark-slot">')[1]?.split('{/if}')[0] ?? '';

/** The markup of each branch of the slot's if chain, keyed by its condition. */
function branches(chain: string): Map<string, string> {
  const parts = chain.split(/\{(#if|:else if|:else)\s*([^}]*)\}/);
  const out = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 3) out.set(`${parts[i]} ${parts[i + 1]}`.trim(), parts[i + 2]);
  return out;
}

describe('the last-backup mark', () => {
  const chain = branches(slot);

  it('sits in one slot whose if chain has no catch-all branch', () => {
    expect(slot).not.toBe('');
    expect([...chain.keys()]).toEqual([
      '#if !preferencesAttached()',
      ":else if standing === 'stale'",
      ":else if standing === 'recent'"
    ]);
  });

  it('draws the tick only for a recent backup and the warning only for a stale one', () => {
    const where = (name: string) =>
      [...chain].filter(([, markup]) => markup.includes(`<Icon name="${name}"`)).map(([condition]) => condition);
    expect(where('check')).toEqual([":else if standing === 'recent'"]);
    expect(where('alert')).toEqual([":else if standing === 'stale'"]);
    expect(chain.get('#if !preferencesAttached()')).not.toMatch(/<(span|Icon)\b/);
  });

  it('takes its standing from backupStanding, where never is its own answer', () => {
    expect(script).toMatch(/let standing = \$derived\(backupStanding\(prefs\.lastBackupAt\)\)/);
  });

  it('fades each mark in and out, and hides the leaving one from screen readers', () => {
    const marks = [...slot.matchAll(/<span class="[^"]*"[^>]*data-backup-(stale|tick)[^>]*>/g)].map((m) => m[0]);
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark).toContain('in:markFade');
      expect(mark).toContain('out:markLeave');
    }
    const leave = script.match(/const markLeave = \(node: Element\) => \{([\s\S]*?)\};/)?.[1] ?? '';
    expect(leave).toContain("node.setAttribute('aria-hidden', 'true')");
  });
});
