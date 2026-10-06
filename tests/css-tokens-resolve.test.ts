/* Every custom property a rule reads has to be defined somewhere. A
   `var(--x)` whose --x nothing sets is invalid at computed-value time, so
   the declaration quietly becomes `unset`: a colour inherits the parent's
   ink, a padding falls back to whatever the element had already, and the
   page still looks almost right. That is how --muted put the voice
   screens' captions at full ink, --space-3.5 left Home's Stop and Log on
   .btn's 24px padding, and --weight-semibold drew the dossier's table
   headers at 450, for months, with every visual check passing (after-
   release ticket 23).

   A property counts as defined when the tree sets it by any of the ways it
   does: a declaration in a stylesheet or a style string, `style:--x=` on an
   element, `setProperty('--x')`, an `@property` rule, or a quoted key in a
   style object. A name built from a template (`--mood-${n}`) is checked as
   a prefix on both sides. A `var(--x, fallback)` with a stated fallback is
   allowed through: the fallback is the author saying what happens when --x
   is not set, which is the opposite of falling back silently. Its fallback
   is still read as a `var()` of its own when it is one. */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Properties set by something outside the source tree, with who sets them. */
const SET_OUTSIDE_SRC: Record<string, string> = {
  // melt's Slider builder writes it on the root's style (Slider.svelte).
  '--percentage': 'melt/builders Slider'
};

type Source = { path: string; text: string };

const NAME = String.raw`--[\w.-]*`;

function withoutComments(text: string): string {
  // Blank rather than delete, so a reported line number is the file's own.
  const blank = (comment: string) => comment.replace(/[^\n]/g, ' ');
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/<!--[\s\S]*?-->/g, blank);
}

/** What the sources define: exact names, and prefixes from templated names. */
function definitions(sources: Source[]) {
  const names = new Set<string>(Object.keys(SET_OUTSIDE_SRC));
  const prefixes = new Set<string>();
  const add = (name: string, templated: boolean) => (templated ? prefixes : names).add(name);
  const forms = [
    new RegExp(String.raw`(?<![\w-])(${NAME})(\$\{[^}]*\})?['"\`]?\s*:(?!:)`, 'g'),
    new RegExp(String.raw`style:(${NAME})(\{)?`, 'g'),
    new RegExp(String.raw`@property\s+(${NAME})()`, 'g'),
    new RegExp(String.raw`setProperty\(\s*['"\`](${NAME})(\$\{)?`, 'g')
  ];
  for (const { text } of sources) {
    const clean = withoutComments(text);
    for (const form of forms) {
      for (const match of clean.matchAll(form)) add(match[1], Boolean(match[2]));
    }
  }
  return { names, prefixes };
}

/** Every `var(--x)` with no stated fallback whose --x nothing defines. */
function unresolved(sources: Source[]): string[] {
  const { names, prefixes } = definitions(sources);
  const found: string[] = [];
  const use = new RegExp(String.raw`var\(\s*(--[\w.-]*)(\$\{)?\s*([,)]?)`, 'g');
  for (const { path, text } of sources) {
    const clean = withoutComments(text);
    for (const match of clean.matchAll(use)) {
      const [, name, templated, next] = match;
      if (next === ',') continue;
      const ok = templated
        ? [...names, ...prefixes].some((defined) => defined.startsWith(name))
        : names.has(name) || [...prefixes].some((prefix) => name.startsWith(prefix));
      if (!ok) {
        const line = clean.slice(0, match.index).split('\n').length;
        found.push(`${path}:${line} ${name}${templated ? '${...}' : ''}`);
      }
    }
  }
  return found;
}

function sourcesUnder(dir: string): Source[] {
  const out: Source[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'paraglide') out.push(...sourcesUnder(full));
    } else if (/\.(css|svelte|ts|js|html)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push({ path: relative(root, full), text: readFileSync(full, 'utf8') });
    }
  }
  return out;
}

describe('every custom property a rule reads is defined', () => {
  it('holds across src', () => {
    expect(unresolved(sourcesUnder(join(root, 'src')))).toEqual([]);
  });

  it('names a planted undefined token, and only that one', () => {
    const planted: Source[] = [
      { path: 'theme.css', text: ':root { --text-2: #55707f; --space-3: 12px; }' },
      {
        path: 'a.svelte',
        text: '<style>.a { color: var(--text-2); padding: 0 var(--space-3.5); }</style>'
      }
    ];
    expect(unresolved(planted)).toEqual(['a.svelte:1 --space-3.5']);
  });

  it('takes every way the tree sets a property as a definition', () => {
    const sources: Source[] = [
      {
        path: 'b.svelte',
        text: [
          '<div style:--at={x} style="--w: {w}px"></div>',
          '<script>el.style.setProperty(`--inset-${side}`, v); el.style.setProperty("--y", v);</script>',
          '<style>@property --z { syntax: "<number>"; inherits: false; initial-value: 0; }',
          '.b { left: var(--at); width: var(--w); top: var(--inset-top); bottom: var(--y); scale: var(--z); }</style>'
        ].join('\n')
      },
      { path: 'roles.ts', text: "const s = { '--role-mark': c }; const t = `var(--role-mark)`;" }
    ];
    expect(unresolved(sources)).toEqual([]);
  });

  it('checks a templated name as a prefix, and lets a stated fallback through', () => {
    const sources: Source[] = [
      { path: 'p.css', text: ':root { --mood-1: red; }' },
      {
        path: 'c.ts',
        text: 'const a = `var(--mood-${n})`; const b = `var(--heat-${n})`; const c = "var(--font-mono, monospace)";'
      },
      { path: 'd.css', text: '.d { color: var(--on-soft, var(--never-set)); }' }
    ];
    expect(unresolved(sources)).toEqual(['c.ts:1 --heat-${...}', 'd.css:1 --never-set']);
  });
});
