/* The generated blocks in SCREENS.md and CONTEXT.md against the code.
Dev tier, like the ADR citation guard: the
   docs live in the private docs repo, so where they are not linked (CI) the
   doc comparison skips with a notice and the marker tests still run.

   `npm run docs:blocks` runs this file with DOC_BLOCKS_WRITE=1, which
   rewrites every block from the code instead of comparing. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCKS, ROOT, blockIn, withBlock } from '../../doc-blocks';

const write = process.env.DOC_BLOCKS_WRITE === '1';
const linked = BLOCKS.every((block) => existsSync(join(ROOT, block.doc)));

describe('a block between markers', () => {
  const doc = [
    'prose above',
    '<!-- generated:demo (npm run docs:blocks writes this block from code; do not edit it here) -->',
    'old',
    '<!-- /generated:demo -->',
    'prose below'
  ].join('\n');

  it('is read without its markers', () => {
    expect(blockIn(doc, 'demo')).toBe('old');
  });
  it('is rewritten without touching the prose around it', () => {
    const next = withBlock(doc, 'demo', 'new\nlines');
    expect(blockIn(next, 'demo')).toBe('new\nlines');
    expect(next.startsWith('prose above\n')).toBe(true);
    expect(next.endsWith('\nprose below')).toBe(true);
  });
  it('is missing when a marker is', () => {
    expect(blockIn(doc.replace('<!-- /generated:demo -->', ''), 'demo')).toBeNull();
    expect(() => withBlock('no markers', 'demo', 'x')).toThrow(/no <!-- generated:demo/);
  });
});

describe.skipIf(!linked)('the generated blocks in the linked docs', () => {
  it.each(BLOCKS.map((block) => [`${block.doc} ${block.name}`, block] as const))('%s matches the code', (_label, block) => {
    const path = join(ROOT, block.doc);
    const text = readFileSync(path, 'utf8');
    const expected = block.render();
    if (write) {
      writeFileSync(path, withBlock(text, block.name, expected));
      return;
    }
    const found = blockIn(text, block.name);
    if (found === null) expect.fail(`${block.doc} has no ${block.name} markers; place the pair once by hand, then run npm run docs:blocks`);
    expect(found, `${block.doc} has drifted from the code in block ${block.name}; run npm run docs:blocks`).toBe(expected);
  });
});

if (!linked) console.warn('doc-blocks: SCREENS.md and CONTEXT.md are not linked (run npm run docs:link); skipping the doc comparison.');
