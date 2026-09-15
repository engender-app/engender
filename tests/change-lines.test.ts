/* The honesty test for the two change lines on /body/measurements (phase 10
   redesign ticket 61).

   The ticket put the rule in its own Scope: no arrow, no "down from", no
   percentage, no colour. If a line needs one of those to read, it is a
   delta of the kind `/compare` refuses and it goes. What is left is a
   change of state with its dates, which is the same kind of statement as
   `400 days post-op` or Care's run-out day, and which ADR-0012 allows
   precisely because it ranks nothing.

   None of that is provable from behaviour, because nothing here computes a
   verdict to catch - the failure mode is somebody later adding one, an
   arrow glyph in a frame or a green class on the value, and the render
   looking better for it. So this is a grep, the same kind kit-surfaces.test.ts
   is and for the same reason: the rule lives in copy and in a style block,
   and neither has an interface to call. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SCREEN = 'src/routes/body/measurements/+page.svelte';
const source = readFileSync(SCREEN, 'utf8');

const markup = source.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const styleBlock = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map((match) => match[1])
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as Record<string, string>;
const pl = JSON.parse(readFileSync('messages/pl.json', 'utf8')) as Record<string, string>;

/** Every string either change line puts on the screen. */
const LINE_KEYS = [
  'measurement_span_start',
  'measurement_span_current',
  'measurement_span_change',
  'size_change_line'
];

describe('the change lines state a change and never rank it', () => {
  it('draws both of them: the size statement and the measurement span', () => {
    expect(markup).toContain('data-size-changes');
    expect(markup).toContain('data-measurement-span');
  });

  it('carries no arrow, no percentage and no comparative word, in either catalogue', () => {
    /* The arrows are the ones a keyboard and an icon set actually reach
       for; the words are the ones the ticket names. `%` would be the
       percentage the ticket refuses outright - size is free text and a
       letter is not a number, so there is nothing to take a percentage of
       on one half and no reason to grade the other. */
    const BANNED = /[←-⇿⬀-⯿⟰-⟿]|%|\b(down from|up from|better|worse|improved|progress towards)\b/i;

    for (const key of LINE_KEYS) {
      expect(en[key], `${key} (en)`).toBeTruthy();
      expect(pl[key], `${key} (pl)`).toBeTruthy();
      expect(en[key], `${key} (en)`).not.toMatch(BANNED);
      expect(pl[key], `${key} (pl)`).not.toMatch(BANNED);
    }
  });

  it('gives neither line a role, so no stripe ever grades a body', () => {
    /* A role is how colour gets onto a surface in this app (kit/role.ts),
       and colour here carries a value (DIRECTION.md rule 3). A change line
       that took one would be saying which end of the change it liked. */
    const spanTag = markup.match(/<dl[^>]*data-measurement-span[^>]*>/)?.[0] ?? '';
    const changesTag = markup.match(/<div[^>]*data-size-changes[^>]*>/)?.[0] ?? '';

    expect(spanTag).not.toBe('');
    expect(changesTag).not.toBe('');
    expect(spanTag).not.toMatch(/\brole=/);
    expect(changesTag).not.toMatch(/\brole=/);
  });

  it("sets their ink from the page and never from a flag's stripe", () => {
    /* Every rule in the screen's own style block that colours one of these
       lines. `--text` and `--text-2` are the page's own ink; `--stripe`,
       `--role-fill`, `--accent` and the rest are a flag's, and a chart is
       where those belong. */
    const rules = [...styleBlock.matchAll(/\.(span|change[a-z-]*)[^{]*\{([^}]*)\}/g)].map((match) => match[2]);

    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) {
      for (const [, value] of body.matchAll(/(?:^|[\s;])color:\s*([^;]+)/g)) {
        expect(value.trim(), 'a change line is set in the page ink').toMatch(/var\(--text(-2)?\)/);
      }
    }
    expect(styleBlock).not.toMatch(/\.(span|change[a-z-]*)[^{]*\{[^}]*--(stripe|role-fill|accent)/);
  });
});
