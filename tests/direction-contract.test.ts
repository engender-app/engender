/* The rules DIRECTION.md (phase 10, second pass) writes for the token layer
   and the shared surfaces, held at the level a stylesheet can be held to
   (redesign ticket 07).

   Greps by design (phase 5 ticket 08): a stylesheet has no interface to
   call, so each rule below is a fact about a file's text. Every assertion
   here was seen to fail against main at 3206d795 before the pass landed;
   a contract test that cannot fail is not a contract test.

   What this file does not check is proportion, which only a render
   settles: tests/direction-swing-gallery.mjs shoots the built app for the
   sign-off. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const SHEETS = {
  base: 'src/lib/theme/base.css',
  palettes: 'src/lib/theme/palettes.css',
  kit: 'src/lib/styles/kit.css',
  components: 'src/lib/styles/components.css',
  app: 'src/lib/styles/app.css',
  screens: 'src/lib/styles/screens.css'
};

/** Every .svelte file under src, recursively. */
function svelteFiles(dir = 'src'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...svelteFiles(path));
    else if (name.endsWith('.svelte')) out.push(path);
  }
  return out;
}

/** A component's own `<style>` blocks, comments stripped. */
function styleBlocks(file: string): string {
  return [...read(file).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map(([, css]) => stripComments(css))
    .join('\n');
}

interface Rule {
  prelude: string;
  body: string;
  /** The nearest enclosing at-rule's prelude, or '' at the top level. */
  at: string;
}

/** Innermost rules only: `prelude { body }` with no braces in the body,
    which is every declaration block whether it sits at the top level or
    inside an @media / @container / @supports wrapper. The wrapper's own
    prelude is kept beside the rule so a test can ask "inside which query". */
function rules(css: string): Rule[] {
  const src = stripComments(css);
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const prelude = match[1].trim();
    const before = src.slice(0, match.index);
    /* The last `{` still open before this rule is the at-rule's own; the
       text between the brace before it and it is the at-rule's prelude. */
    const open: number[] = [];
    for (let i = 0; i < before.length; i++) {
      if (before[i] === '{') open.push(i);
      else if (before[i] === '}') open.pop();
    }
    let at = '';
    if (open.length) {
      const brace = open[open.length - 1];
      const start = Math.max(before.lastIndexOf('}', brace), before.lastIndexOf('{', brace - 1));
      at = before.slice(start + 1, brace).trim();
    }
    out.push({ prelude, body: match[2], at });
  }
  return out;
}

/** `prop: value` pairs of one declaration block. */
function declarations(body: string): Array<[string, string]> {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.includes(':'))
    .map((d) => {
      const at = d.indexOf(':');
      return [d.slice(0, at).trim(), d.slice(at + 1).trim()] as [string, string];
    });
}

/** Whitespace-split at the top level, so `calc(a + b)` stays one token. */
function tokens(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** The custom properties `:root` in base.css declares, by name. */
function baseTokens(): Record<string, string> {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(stripComments(read(SHEETS.base)))?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const [prop, value] of declarations(root)) if (prop.startsWith('--')) out[prop] = value;
  return out;
}

const sheet = (name: keyof typeof SHEETS) => stripComments(read(SHEETS[name]));
const kitComponents = readdirSync('src/lib/components/kit').filter((f) => f.endsWith('.svelte'));
const kitAllCss = [
  sheet('kit'),
  ...kitComponents.map((f) => styleBlocks(`src/lib/components/kit/${f}`))
].join('\n');
const ruleFor = (css: string, prelude: string) =>
  rules(css).find((r) =>
    r.prelude
      .split(',')
      .map((s) => s.trim())
      .includes(prelude)
  );

describe('the tokens (DIRECTION.md, "For ticket 07")', () => {
  const t = baseTokens();

  it('names one block radius and retires the ramp', () => {
    expect(t['--r-block']).toBe('6px');
    for (const gone of [
      '--radius-xs',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--radius-xl',
      '--r-card',
      '--r-add'
    ]) {
      expect(t[gone], `${gone} should be retired`).toBeUndefined();
    }
    /* The capsule survives for the one shape that is one: a tag. */
    expect(t['--radius-pill']).toBe('999px');
  });

  it('sets the type scale at 48 / 28 / 17 / 15 and the display weight at 800', () => {
    expect(t['--text-4xl']).toBe('3rem');
    expect(t['--text-2xl']).toBe('1.75rem');
    expect(t['--text-lg']).toBe('1.0625rem');
    expect(t['--text-sm']).toBe('0.9375rem');
    /* A number on a block. */
    expect(t['--text-3xl']).toBe('2.5rem');
    expect(t['--weight-display']).toBe('800');
    expect(t['--display-track']).toBe('-0.04em');
  });

  it('keeps the rhythm steps a rule can name', () => {
    expect(t['--space-3']).toBe('12px');
    expect(t['--space-5']).toBe('20px');
    expect(t['--space-8']).toBe('40px');
  });

  it('retires the retired radius tokens from every stylesheet and component', () => {
    const gone = /var\(--(radius-(xs|sm|md|lg|xl)|r-card|r-add)\)/;
    for (const name of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
      expect(sheet(name), SHEETS[name]).not.toMatch(gone);
    }
    for (const file of svelteFiles()) expect(read(file), file).not.toMatch(gone);
    for (const file of ['src/lib/motion/press.css', 'src/lib/motion/materials.css', 'src/lib/theme/fonts.css']) {
      expect(read(file), file).not.toMatch(gone);
    }
  });
});

describe('rule 5: the radius budget', () => {
  /* Where a corner may resolve to. 6 is the block, 8 the segmented track
     around six-cornered segments, 50% a disc; 2 and 4 are the ends of a
     chart bar, a rail or a flag bar (rule 9), and 1 the end of a hairline
     drawn as a box. 999 is a capsule, and only a tag is one. */
  /* 100% is the disc's other spelling: the calendar draws a split day as two
     half-discs, and a half-disc is 100% on its two round corners. */
  const allowed = new Set(['0', '1px', '2px', '4px', '6px', '8px', '50%', '100%', 'inherit']);
  const capsule = /\.kit-pill|\.tag-chip/;
  /* Two files draw something that is deliberately not this app: the decoy
     notes screen (ADR-0035's disguise has to look like somebody else's notes
     app, and a 6px world is now this app's tell) and the demo bar, which is
     development tooling drawn in nobody's palette. */
  const exempt = /DecoyNotes\.svelte|DemoBar\.svelte/;

  function resolve(value: string, t: Record<string, string>): string {
    /* Until nothing is left to substitute, so a component's own
       `--r: var(--r-block)` lands on the base token it points at however
       many hops away that is. */
    let out = value;
    for (let i = 0; i < 8 && /var\(/.test(out); i++) {
      out = out.replace(/var\((--[a-z0-9-]+)\)/g, (_, name) => t[name] ?? `unresolved(${name})`);
    }
    return out;
  }

  /** The base tokens, plus whatever custom properties the sheet under test
      declares for itself (a component's own `--r`, say). */
  function tokensFor(css: string): Record<string, string> {
    const t = { ...baseTokens() };
    for (const rule of rules(css)) {
      for (const [prop, value] of declarations(rule.body)) if (prop.startsWith('--')) t[prop] = value;
    }
    return t;
  }

  function check(css: string, where: string) {
    const t = tokensFor(css);
    for (const rule of rules(css)) {
      for (const [prop, value] of declarations(rule.body)) {
        if (prop !== 'border-radius') continue;
        for (const corner of tokens(resolve(value, t))) {
          /* The elliptical syntax's separator, not a corner. */
          if (corner === '/') continue;
          if (corner === '999px' && capsule.test(rule.prelude)) continue;
          expect(
            allowed.has(corner),
            `${where}: ${rule.prelude} { border-radius: ${value} } resolves a corner to ${corner}`
          ).toBe(true);
        }
      }
    }
  }

  it('resolves every corner in the shared sheets to 6px, 8px, 50%, a bar end, or a tag', () => {
    for (const name of ['kit', 'components', 'app', 'screens'] as const) check(sheet(name), SHEETS[name]);
  });

  it("resolves every corner in a component's own style block the same way", () => {
    for (const file of svelteFiles()) {
      if (exempt.test(file)) continue;
      check(styleBlocks(file), file);
    }
  });

  it('gives the capsule to the tag alone', () => {
    for (const name of ['kit', 'components', 'app', 'screens'] as const) {
      for (const rule of rules(sheet(name))) {
        if (!/var\(--radius-pill\)|999px/.test(rule.body)) continue;
        expect(rule.prelude, `${SHEETS[name]}: ${rule.prelude}`).toMatch(capsule);
      }
    }
  });
});

describe('rule 4: two line strengths', () => {
  it('retires --border and --outline-strong from the palettes', () => {
    const palettes = sheet('palettes');
    expect(palettes).not.toMatch(/--border:/);
    expect(palettes).not.toMatch(/--outline-strong/);
    expect(palettes).toMatch(/--outline:\s*color-mix\(in oklab, var\(--text\) 19%, transparent\)/);
    expect(palettes).toMatch(/--hairline:\s*color-mix\(in oklab, var\(--text\) 14%, transparent\)/);
  });

  it('and from everything that read them', () => {
    const gone = /var\(--(border|outline-strong)\)/;
    for (const name of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
      expect(sheet(name), SHEETS[name]).not.toMatch(gone);
    }
    for (const file of svelteFiles()) expect(read(file), file).not.toMatch(gone);
  });

  it('keeps the legibility boost, on the two lines that are left', () => {
    const boost = ruleFor(sheet('base'), "html[data-palette][data-theme][data-a11y-legibility='boost']");
    expect(boost).toBeTruthy();
    expect(boost!.body).toMatch(/--outline:/);
    expect(boost!.body).toMatch(/--hairline:/);
    expect(boost!.body).not.toMatch(/--border:/);
  });
});

describe('rule 1: rhythm', () => {
  /* The blocks that may reach past 20px vertically: a section heading (40
     above its rule), the two header blocks, the desktop rail's own inset,
     and a gate or an empty state centring itself (48 and 64 are theirs). */
  const allowedAbove =
    /\.kit-heading|\.section-title|\.screen-header|\.home-header|\.app-rail|\.gate\b|\.empty-state|\.wrapped-thin|\.wrapped-year-close|\.wrapped-cover/;
  const tall = /--space-(6|7|8|9|10)\b/;

  function vertical(prop: string, value: string): string[] {
    const v = tokens(value);
    if (/^(margin|padding)-(top|bottom)$/.test(prop) || prop === 'row-gap') return v;
    if (/^(margin|padding)-block$/.test(prop)) return v;
    if (prop === 'margin' || prop === 'padding') return v.length >= 3 ? [v[0], v[2]] : [v[0]];
    if (prop === 'gap') return [v[0]];
    return [];
  }

  it('lets no block take --space-6 or more vertically outside the shared rhythm rules', () => {
    const sources: Array<[string, string]> = [
      ['kit', sheet('kit')],
      ['components', sheet('components')],
      ['app', sheet('app')],
      ['screens', sheet('screens')],
      ...kitComponents.map((f) => [f, styleBlocks(`src/lib/components/kit/${f}`)] as [string, string])
    ];
    for (const [where, css] of sources) {
      for (const rule of rules(css)) {
        if (allowedAbove.test(rule.prelude)) continue;
        for (const [prop, value] of declarations(rule.body)) {
          for (const v of vertical(prop, value)) {
            expect(tall.test(v), `${where}: ${rule.prelude} { ${prop}: ${value} }`).toBe(false);
          }
        }
      }
    }
  });

  it('spaces the blocks of a screen 20 apart', () => {
    const app = sheet('app');
    expect(ruleFor(app, '.screen > *')?.body).toMatch(/margin-bottom:\s*var\(--space-5\)/);
    expect(ruleFor(app, '.screen > .screen-part > *')?.body).toMatch(/margin-bottom:\s*var\(--space-5\)/);
    expect(ruleFor(sheet('kit'), '[data-kit-surface] + [data-kit-surface]')?.body).toMatch(
      /margin-top:\s*var\(--space-5\)/
    );
  });

  it('sets a section heading 40 above its 3px rule and 12 under it', () => {
    const heading = ruleFor(sheet('kit'), '.kit-heading');
    expect(heading?.body).toMatch(/margin:\s*var\(--space-8\) 0 var\(--space-3\)/);
    expect(heading?.body).toMatch(/padding:\s*var\(--space-3\) 0 0/);
    expect(heading?.body).toMatch(/border-top:\s*3px solid var\(--text\)/);
    const app = sheet('app');
    expect(ruleFor(app, '.screen > .kit-heading')?.body).toMatch(/margin-bottom:\s*var\(--space-3\)/);
    expect(ruleFor(app, '.screen > .screen-part > .kit-heading')?.body).toMatch(
      /margin-bottom:\s*var\(--space-3\)/
    );
  });
});

describe('rule 2: type', () => {
  it('sets every display-face rule at the display weight', () => {
    const sources: Array<[string, string]> = [
      ['kit', sheet('kit')],
      ['components', sheet('components')],
      ['app', sheet('app')],
      ['screens', sheet('screens')],
      ...svelteFiles().map((f) => [f, styleBlocks(f)] as [string, string])
    ];
    let seen = 0;
    for (const [where, css] of sources) {
      for (const rule of rules(css)) {
        if (!/font-family:\s*var\(--font-display\)/.test(rule.body)) continue;
        seen++;
        expect(rule.body, `${where}: ${rule.prelude}`).toMatch(/font-weight:\s*var\(--weight-display\)/);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('sets the section heading at 28 and the screen title at 48', () => {
    const h2 = ruleFor(sheet('kit'), '.kit-heading h2')?.body ?? '';
    expect(h2).toMatch(/font-size:\s*var\(--text-2xl\)/);
    /* --leading-display is 1.05 now; either spelling is the same number. */
    expect(h2).toMatch(/line-height:\s*(1\.05|var\(--leading-display\))/);
    const title = ruleFor(sheet('components'), '.screen-title')?.body ?? '';
    expect(title).toMatch(/font-size:\s*var\(--text-4xl\)/);
    expect(title).toMatch(/letter-spacing:\s*-0\.045em/);
    expect(title).toMatch(/line-height:\s*0\.95/);
  });

  it('sets a content title in the body face at 17', () => {
    const h3 = ruleFor(sheet('kit'), '.kit-chart-head h3')?.body ?? '';
    expect(h3).toMatch(/font-family:\s*var\(--font-body\)/);
    expect(h3).toMatch(/font-size:\s*var\(--text-lg\)/);
    expect(h3).not.toMatch(/--display-track/);
  });

  it('sets secondary text at 15 and weight 600, not 14 at 450', () => {
    for (const [where, prelude] of [
      ['kit', '.kit-row-sub'],
      ['kit', '.kit-tile-note'],
      ['kit', '.kit-notice-text'],
      ['components', '.screen-subtitle']
    ] as const) {
      const body = ruleFor(sheet(where), prelude)?.body ?? '';
      expect(body, prelude).toMatch(/font-size:\s*var\(--text-sm\)/);
      expect(body, prelude).toMatch(/font-weight:\s*var\(--weight-medium\)/);
    }
  });
});

describe('rule 4: surfaces are flush, block or ink', () => {
  const kit = sheet('kit');
  const flush = (prelude: string) => {
    const rule = ruleFor(kit, prelude);
    expect(rule, `${prelude} should exist`).toBeTruthy();
    const body = rule!.body;
    expect(body, `${prelude} paints a ground`).not.toMatch(/background:\s*var\(--surface\)/);
    expect(body, `${prelude} has a corner`).not.toMatch(/border-radius:\s*(?!0\b)/);
    expect(body, `${prelude} has a card edge`).not.toMatch(/border:\s*1px solid var\(--outline\)/);
    return body;
  };

  it('sets a list, a notice, the mood row and a panel between two hairlines', () => {
    for (const prelude of ['.kit-list', '.kit-notice', '.kit-moods', '.kit-panel']) {
      const body = flush(prelude);
      expect(body, prelude).toMatch(/border-top:\s*1px solid var\(--hairline\)/);
      expect(body, prelude).toMatch(/border-bottom:\s*1px solid var\(--hairline\)/);
    }
  });

  it('unboxes the chart and the day card', () => {
    flush('.kit-chart');
    flush('.kit-day');
    expect(ruleFor(kit, '.kit-chart + .kit-chart')?.body).toMatch(/border-top:\s*1px solid var\(--hairline\)/);
  });

  it("makes a row's icon a 36px block of its stripe with the fill's ink", () => {
    const ico = ruleFor(kit, '.kit-row-ico')?.body ?? '';
    expect(ico).toMatch(/width:\s*36px/);
    expect(ico).toMatch(/border-radius:\s*var\(--r-block\)/);
    expect(ico).toMatch(/background:\s*var\(--role-draw\)/);
    expect(ico).toMatch(/color:\s*var\(--role-fill-ink\)/);
    /* And the row itself is flush to the screen's own inset. */
    const row = ruleFor(kit, '.kit-row')?.body ?? '';
    const padding = declarations(row).find(([p]) => p === 'padding')?.[1] ?? '';
    const [, right = '0', , left = right] = tokens(padding);
    expect([right, left], `.kit-row { padding: ${padding} }`).toEqual(['0', '0']);
  });

  it("makes a day's date bar and a tag blocks of the stripe, in the ink proven on it", () => {
    for (const prelude of ['.kit-day-bar', '.kit-pill']) {
      const body = ruleFor(kit, prelude)?.body ?? '';
      expect(body, prelude).toMatch(/background:\s*var\(--role-draw\)/);
      expect(body, prelude).toMatch(/color:\s*var\(--role-fill-ink\)/);
      expect(body, prelude).not.toMatch(/--role-tint|--role-ink\b/);
    }
  });

  it("sets the notice's mark as a 40px square of ink", () => {
    const ico = ruleFor(kit, '.kit-notice-ico')?.body ?? '';
    expect(ico).toMatch(/width:\s*40px/);
    expect(ico).toMatch(/background:\s*var\(--text\)/);
    expect(ico).toMatch(/color:\s*var\(--bg\)/);
    expect(ico).toMatch(/border-radius:\s*var\(--r-block\)/);
  });

  it('inverts the segmented control: an 8px track, a 6px pill of ink', () => {
    const components = sheet('components');
    expect(ruleFor(components, '.segmented')?.body).toMatch(/border-radius:\s*8px/);
    const pill = ruleFor(components, '.segment-pill')?.body ?? '';
    expect(pill).toMatch(/background:\s*var\(--text\)/);
    expect(pill).toMatch(/border-radius:\s*var\(--r-block\)/);
    expect(pill).not.toMatch(/border:\s*1px/);
    expect(ruleFor(components, '.segment.is-active')?.body).toMatch(/color:\s*var\(--bg\)/);
  });
});

/* The tile, which rule 3 spends more words on than anything else and which
   redesign ticket 24 builds: a solid block of the area's stripe with the
   title and the value on it, a foot of page colour carrying the note, and
   the same shape whatever controls the tile has. Held here because the
   three shapes are three rules and the one that gets forgotten is the one
   nobody has on screen. */
describe('rule 3: a tile is a block with a foot', () => {
  const kit = sheet('kit');
  const SHAPES = ['.kit-tile', '.kit-tile.is-split'];

  it('grounds every tile shape in the stripe undiluted, edged and cornered once', () => {
    for (const prelude of SHAPES) {
      const body = ruleFor(kit, prelude)?.body ?? '';
      expect(body, prelude).toMatch(/background:\s*var\(--role-draw\)/);
      expect(body, prelude).toMatch(/border:\s*1px solid var\(--outline\)/);
      expect(body, prelude).toMatch(/border-radius:\s*var\(--r-block\)/);
      expect(body, prelude).not.toMatch(/--role-tint|--role-wash/);
    }
  });

  it('writes the title and the value on the block in the ink proven on it', () => {
    const title = ruleFor(kit, '.kit-tile-title')?.body ?? '';
    expect(title).toMatch(/font-size:\s*var\(--text-block\)/);
    expect(title).toMatch(/font-weight:\s*var\(--weight-bold\)/);
    expect(title).toMatch(/color:\s*var\(--role-fill-ink\)/);
    const value = ruleFor(kit, '.kit-tile-value')?.body ?? '';
    expect(value).toMatch(/font-size:\s*var\(--text-3xl\)/);
    expect(value).toMatch(/color:\s*var\(--role-fill-ink\)/);
    expect(ruleFor(kit, ".kit-tile[data-weight='row'] .kit-tile-value")?.body).toMatch(
      /font-size:\s*var\(--text-2xl\)/
    );
  });

  /* Every band clears 3:1 under the fill ink and none of them clears 4.5:1
     under it at 15px, so nothing small may sit on a block. 19px bold and
     40px display are both large text; the note, which is 15px, is the
     reason the foot exists at all. */
  it('sets nothing under large text on the block', () => {
    const t = baseTokens();
    const rem = (token: string) => Number(/([\d.]+)rem/.exec(t[token] ?? '')?.[1] ?? '0') * 16;
    expect(rem('--text-block')).toBeGreaterThanOrEqual(18.66);
    expect(Number(t['--weight-bold'])).toBeGreaterThanOrEqual(700);
    expect(rem('--text-3xl')).toBeGreaterThanOrEqual(18.66);
    expect(rem('--text-2xl')).toBeGreaterThanOrEqual(18.66);
    /* And the one small thing left is off the stripe: the foot's ground is
       the page. */
    expect(rem('--text-sm')).toBeLessThan(18.66);
  });

  it('runs the foot along the bottom edge of the block, in page colour, full width', () => {
    const note = ruleFor(kit, '.kit-tile-note')?.body ?? '';
    expect(note).toMatch(/background:\s*var\(--bg\)/);
    expect(note).toMatch(/color:\s*var\(--text-2\)/);
    /* Out past the block's own padding on both sides, and on the third the
       tile's own inset for the dismiss control, so no shape leaves a sliver
       of stripe beside its foot. */
    expect(note).toMatch(/margin-left:\s*calc\(-1 \* var\(--space-4\)\)/);
    expect(note).toMatch(/margin-right:\s*calc\(-1 \* var\(--space-4\)\)/);
    expect(note).toMatch(/margin-bottom:\s*calc\(-1 \* var\(--space-4\)\)/);
    expect(ruleFor(kit, '.kit-tile.has-dismiss > .kit-tile-note')?.body).toMatch(
      /margin-right:\s*calc\(-1 \* var\(--space-7\)\)/
    );
    /* And it ends at a line, never through one: the clamp is on an inner
       span because the foot itself is a grid or flex item, which blockifies
       `display: -webkit-box` away. */
    const text = ruleFor(kit, '.kit-tile-note-text')?.body ?? '';
    expect(text).toMatch(/display:\s*-webkit-box/);
    expect(text).toMatch(/-webkit-line-clamp:\s*2/);
  });

  /* The look-back pair, and Safe space's two stats: one colour each, the
     note on the block rather than in a foot, and the flag bar as the motif
     between value and note. */
  it('gives the tight pair no foot, and the flag bar instead', () => {
    const note = ruleFor(kit, '.kit-tiles[data-tight] .kit-tile-note')?.body ?? '';
    expect(note).toMatch(/background:\s*none/);
    expect(note).toMatch(/color:\s*var\(--role-fill-ink\)/);
    expect(note).toMatch(/font-size:\s*var\(--text-block\)/);
    expect(note).toMatch(/margin:\s*0/);
    const bar = rules(kit).find((r) => /--flag-fill/.test(r.prelude) && /::after/.test(r.prelude));
    expect(bar, 'the flag bar rule').toBeTruthy();
    expect(bar!.prelude, 'the bar is the tight pair\'s motif').toMatch(/\[data-tight\]/);
    expect(bar!.body).toMatch(/background-image:\s*var\(--flag-fill\)/);
    expect(bar!.body).toMatch(/border-radius:\s*2px/);
  });

  it('sets a control on the block against the block: the page for a button, the fill ink for a dismiss', () => {
    const act = ruleFor(kit, '.kit-tile-act.btn')?.body ?? '';
    expect(act).toMatch(/background:\s*var\(--bg\)/);
    expect(act).toMatch(/color:\s*var\(--text\)/);
    expect(ruleFor(kit, '.kit-tile-dismiss')?.body).toMatch(/color:\s*var\(--role-fill-ink\)/);
  });
});

describe('rule 9: chart ink', () => {
  it('draws a series at 2, a guide at 1, and the donut ring at 12, nothing else', () => {
    const widths = [...kitAllCss.matchAll(/stroke-width:\s*([\d.]+)/g)].map(([, w]) => Number(w));
    expect(widths.length).toBeGreaterThan(5);
    for (const w of widths) expect([1, 2, 12], `stroke-width ${w}`).toContain(w);
  });

  it('gives a series square caps and mitred joins', () => {
    const line = ruleFor(kitAllCss, '.kit-area-line')?.body ?? '';
    expect(line).toMatch(/stroke-width:\s*2\b/);
    expect(line).toMatch(/stroke-linecap:\s*square/);
    expect(line).toMatch(/stroke-linejoin:\s*miter/);
    expect(ruleFor(kitAllCss, '.kit-area-legend-mark')?.body).toMatch(/border-top:\s*2px solid/);
  });

  it('draws a bar as a 14px block with 2px ends, the inline bar with 4px', () => {
    const kit = sheet('kit');
    expect(ruleFor(kit, '.kit-bar-track')?.body).toMatch(/height:\s*14px/);
    const mark = ruleFor(kit, '.kit-bar-mark')?.body ?? '';
    expect(mark).toMatch(/height:\s*14px/);
    expect(mark).toMatch(/border-radius:\s*2px/);
    expect(ruleFor(kit, '.kit-bars.is-inline .kit-bar-mark')?.body).toMatch(/border-radius:\s*4px/);
    expect(ruleFor(kit, '.kit-dist-mark')?.body).toMatch(/border-radius:\s*2px/);
  });

  it("gives the chart picker's face a 6px box with a 2px ink edge, 28px tall", () => {
    const face = ruleFor(sheet('kit'), '.kit-chart-pick-face')?.body ?? '';
    expect(face).toMatch(/border-radius:\s*var\(--r-block\)/);
    expect(face).toMatch(/border:\s*2px solid var\(--text\)/);
    expect(face).toMatch(/height:\s*28px/);
  });
});

describe('the two 200% zoom defects (ticket 07)', () => {
  const narrow = (css: string, prelude: string) =>
    rules(css).find((r) => r.prelude === prelude && /max-width:\s*240px/.test(r.at));

  it("drops the notice's icon square below 240px so the text keeps a column", () => {
    const kit = sheet('kit');
    expect(narrow(kit, '.kit-notice-ico')?.body).toMatch(/display:\s*none/);
    expect(narrow(kit, '.kit-notice')?.body).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  });

  it('lets the compact segmented control stop being compact and scroll below 240px', () => {
    const components = sheet('components');
    expect(narrow(components, '.segmented.is-compact')?.body).toMatch(/display:\s*inline-flex/);
    expect(narrow(components, '.segmented.is-compact .segment')?.body).toMatch(/flex:\s*0 0 auto/);
  });
});
