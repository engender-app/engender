import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { icon } from '../src/lib/components/icons.ts';

const source = await readFile('src/lib/data/hubRows.ts', 'utf8');
const names = [...new Set([...source.matchAll(/\bicon:\s*'([^']+)'/g)].map((match) => match[1]))];
const scratch = await mkdtemp(join(tmpdir(), 'hub-icon-masks-'));
const destination = 'src/lib/components/hub-icon-masks';
await mkdir(destination, { recursive: true });

for (const name of names) {
  const svg = join(scratch, `${name}.svg`);
  const png = join(destination, `${name}.png`);
  await writeFile(svg, icon(name, 44).replaceAll('currentColor', '#fff'));
  execFileSync('convert', ['-background', 'none', svg, png], { stdio: 'ignore' });
}

console.log(`Generated ${names.length} hub icon masks`);
