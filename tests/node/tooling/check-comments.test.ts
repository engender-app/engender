import { describe, expect, it } from 'vitest';
import { commentRanges, countReferences } from '../../../scripts/check-comments.mjs';

describe('source comment guard', () => {
  it('counts source comments without reading strings or regular expressions', () => {
    const source = String.raw`
// ticket 2
const url = 'https://example.invalid/phase 9';
const example = /\/\* ticket 5 \*\//;
const snippet = \`/* phase 7 */\`;
const value = (/* functional audit */ 1); // .scratch/example
`.replaceAll('\\`', '`');
    expect(countReferences('example.ts', source)).toBe(3);
  });

  it('finds comments in Svelte script, markup, expressions and CSS', () => {
    const source = `<script>let value = 'ticket 1'; // ticket 2
</script>
<div title="<!-- phase 1 -->">{value /* \x43ONTEXT.md */}<!-- ux-carpet --></div>
<style>/* pre-release-human */ div { color: red }</style>`;
    expect(commentRanges('example.svelte', source).map(({ start, end }) => source.slice(start, end)))
      .toEqual(['// ticket 2', '/* \x43ONTEXT.md */', '<!-- ux-carpet -->', '/* pre-release-human */']);
  });

  it('keeps comment markers inside Java text blocks and HTML attributes out of the scan', () => {
    expect(countReferences('Example.java', 'String value = """\n// ticket 6\n"""; // phase 2')).toBe(1);
    expect(countReferences('example.html', '<p title="<!-- ticket 6 -->">Hi</p><!-- last audit -->')).toBe(1);
    expect(countReferences('example.css', 'a { background: url(https://example.invalid) /* ticket 6 */ }')).toBe(1);
  });

  it('finds internal review labels in comments and architecture prose', () => {
    const labels = [
      'prh18', 'item 90', 'sign-off crop', 'audit U2', 'L08-01',
      'after-release 28', 'carpet 30', 'UX-07', 'sec-audit 02'
    ];
    expect(countReferences('example.ts', labels.map((label) => '// ' + label).join('\n')))
      .toBe(labels.length);
    expect(countReferences('ARCHITECTURE.md', 'Use shared controls (after-release 28).'))
      .toBe(1);
  });

  it('checks full-line comments in the SQL baseline', () => {
    const source = 'const schema = `\n-- Audit L08-01\nSELECT 1;`';
    expect(countReferences('src/lib/data/sqlite/schema.ts', source)).toBe(1);
  });

  it('leaves technical numbers and identifiers alone', () => {
    const source = '// Track item-2 at 195px. WebView (76), schema (78), ADR-0023.';
    expect(countReferences('example.ts', source)).toBe(0);
  });

  it('finds wrapped ticket citations and permits public ADR paths', () => {
    const source = '/** Phase 4 tickets\n * CARPET-07 and 12. See docs/adr/0045-example.md and docs/\x69nternal/notes.md. */';
    expect(countReferences('example.ts', source)).toBe(3);
  });
});
