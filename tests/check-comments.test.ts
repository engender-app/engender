import { describe, expect, it } from 'vitest';
import { commentRanges, countReferences, referenceGrowth } from '../scripts/check-comments.mjs';

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

  it('allows counts to fall and catches new references per file', () => {
    const problems = referenceGrowth({ 'old.ts': 1, 'new.ts': 1 }, { 'old.ts': 2 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('new.ts');
  });

  it('finds wrapped ticket citations and permits public ADR paths', () => {
    const source = '/** Phase 4 tickets\n * CARPET-07 and 12. See docs/adr/0045-example.md and docs/\x69nternal/notes.md. */';
    expect(countReferences('example.ts', source)).toBe(3);
  });
});
