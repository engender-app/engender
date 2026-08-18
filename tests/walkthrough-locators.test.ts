import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const walkthroughPath = fileURLToPath(new URL('./walkthrough.test.mjs', import.meta.url));
const source = readFileSync(walkthroughPath, 'utf8');
const lines = source.split('\n');

// Matches the selector-string argument of the calls the walkthrough uses to
// find elements. Deliberately excludes getByRole (role name, not a
// selector) and getByText (covered by the copy-based check below).
const SELECTOR_CALL =
  /(?:\.locator|waitForSelector|querySelector|querySelectorAll|page\.textContent)\(\s*(['"`])((?:(?!\1).)*)\1/g;

// A class token: a literal `.` followed by a letter. Every handle this
// suite uses after ADR (walkthrough handle vocabulary) is a `data-*`
// attribute, an id, an ARIA role/state, or a bare tag name - none of which
// contain that pattern.
const CLASS_TOKEN = /\.[a-zA-Z]/;

const TEXT_UNDER_TEST_MARKER = '// text-under-test';

describe('the walkthrough grips handles, never structure or wording', () => {
  it('finds every element by a data-* handle or an ARIA role, not a CSS class', () => {
    const offenders: string[] = [];
    for (const [i, line] of lines.entries()) {
      for (const match of line.matchAll(SELECTOR_CALL)) {
        const selector = match[2];
        if (CLASS_TOKEN.test(selector)) {
          offenders.push(`line ${i + 1}: ${selector}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('marks every copy-based locator as a deliberate text-under-test exception', () => {
    const offenders: string[] = [];
    for (const [i, line] of lines.entries()) {
      const usesCopy = line.includes('hasText') || line.includes(':has-text(') || line.includes('getByText(');
      if (usesCopy && !line.includes(TEXT_UNDER_TEST_MARKER)) {
        offenders.push(`line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
