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
  const capsule = /\.kit-pill|\.tag-chip|\.photo-year/;
  /* The one corner in the app that is a proportion rather than a px, and the
     only place a proportion is right: a mood face is a drawing inside a
     24-unit viewBox, so its block's corner is 6.4 of those units
     (moodFace.ts's MOOD_BLOCK) and scales with whatever size a surface asks
     the face for. The ring the picked face takes has to follow the same
     corner or it cuts across it, which is why this exception is a selector
     rather than a value (phase 10 ticket 27, ADR-0077). */
  const moodBlock = /\.mood-face|\.cal-card|\.cal-swatch|\.cal-half/;
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
          if ((corner === '26.7%' || corner === '53.4%') && moodBlock.test(rule.prelude)) continue;
          expect(
            allowed.has(corner),
            `${where}: ${rule.prelude} { border-radius: ${value} } resolves a corner to ${corner}`
          ).toBe(true);
        }
      }
    }
  }

  it("resolves every corner in the shared sheets to 6px, 8px, 50%, a bar end, a tag, or a mood face's own block", () => {
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

  /* The elevation half of rule 4, which ticket 07 recorded as "unchanged"
     and left untested: the ban was real in the kit and nothing held it
     anywhere else, which is how fifteen rules outside the kit kept a
     --shadow-1 through the whole token pass. The cohesion sweep (ticket 20)
     found them by rendering every route and reading the computed tree; this
     is the same finding as a grep, so the next one cannot ship. */
  it('retires the elevation ramp from both themes', () => {
    for (const name of ['base', 'palettes'] as const)
      expect(sheet(name), SHEETS[name]).not.toMatch(/--shadow-[123]\s*:/);
  });

  it('leaves nothing reading the ramp', () => {
    const gone = /var\(--shadow-[123]\)/;
    for (const name of Object.keys(SHEETS) as Array<keyof typeof SHEETS>)
      expect(sheet(name), SHEETS[name]).not.toMatch(gone);
    for (const file of svelteFiles()) expect(read(file), file).not.toMatch(gone);
  });

  /* What may still cast: the floating bar, which rule 4 names as the app's
     one shadow, and a ring - box-shadow is the only spelling CSS has for
     one, drawn inward as an inset (kit.css at .kit-block's edge) or outward
     as a spread with no offset and no blur (a knockout, as the timeline's
     dots draw). Neither is a surface floating, which is what the rule
     bans. */
  it('lets nothing but the floating bar and a ring cast one', () => {
    const bar = /--shadow-float/;
    const ring = /inset|(?:^|\s)0 0 0 /;
    for (const name of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
      for (const rule of rules(sheet(name))) {
        for (const [prop, value] of declarations(rule.body)) {
          if (prop !== 'box-shadow' || value === 'none') continue;
          expect(
            bar.test(value) || ring.test(value),
            `${SHEETS[name]}: ${rule.prelude} casts ${value}`
          ).toBe(true);
        }
      }
    }
  });

  /* The six surfaces that gave up an elevation take a block's own edge, not
     a separator's. Added because `.card` was left behind at --hairline when
     the other five moved - the comment above it and the commit that made
     the change both said --outline, and nothing read the declaration. A
     rationale in a comment is not a contract. */
  it('draws every unelevated surface edge at --outline', () => {
    const surfaces = [
      ['components', '.card'],
      ['components', '.entry-card'],
      ['components', '.skeleton-card'],
      ['components', '.skeleton-block'],
      ['screens', '.wrapped-card'],
      ['screens', '.wrapped-stat']
    ] as const;
    for (const [name, selector] of surfaces) {
      const rule = ruleFor(sheet(name), selector);
      expect(rule, `${SHEETS[name]}: no rule for ${selector}`).toBeTruthy();
      const border = declarations(rule!.body).find(([prop]) => prop === 'border');
      expect(border, `${selector} should draw its own edge`).toBeTruthy();
      expect(border![1], `${selector}`).toBe('1px solid var(--outline)');
    }
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
     above its rule), the two header blocks and the field they paint (40
     above a title, rule 7), the desktop rail's own inset, and a gate or an
     empty state centring itself (48 and 64 are theirs). */
  const allowedAbove =
    /\.kit-heading|\.section-title|\.screen-header|\.screen-field|\.home-header|\.app-rail|\.gate\b|\.empty-state|\.wrapped-thin|\.wrapped-year-close|\.wrapped-cover/;
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

  /* Every other screen is a door or hangs off one, and the door title (48px)
     is the largest thing on it. The wrapped cover is the one screen that is
     a poster rather than a door, and its year is the whole image, so it
     alone may go above 48 (Alicja's triage decision, carpet 23; DIRECTION.md
     rule 2). Allowed by selector, not by value, so the exception cannot
     spread - the same shape as ADR-0077's mood-block radius exception. */
  it("holds every display-face size at 48 or under, except the wrapped cover's poster year", () => {
    const base = baseTokens();
    function resolvePx(value: string): number {
      let v = value.trim();
      const varRef = /^var\((--[a-z0-9-]+)\)$/.exec(v);
      if (varRef) v = (base[varRef[1]] ?? '').trim();
      const rem = /^([\d.]+)rem$/.exec(v);
      if (rem) return Number(rem[1]) * 16;
      const px = /^([\d.]+)px$/.exec(v);
      if (px) return Number(px[1]);
      return NaN;
    }
    const sources: Array<[string, string]> = [
      ['kit', sheet('kit')],
      ['components', sheet('components')],
      ['app', sheet('app')],
      ['screens', sheet('screens')],
      ...svelteFiles().map((f) => [f, styleBlocks(f)] as [string, string])
    ];
    let seenException = false;
    for (const [where, css] of sources) {
      for (const rule of rules(css)) {
        const decl = Object.fromEntries(declarations(rule.body));
        if (!decl['font-size']) continue;
        const size = resolvePx(decl['font-size']);
        if (Number.isNaN(size)) continue;
        if (size === 64 && /\.wrapped-cover-year\b/.test(rule.prelude)) {
          seenException = true;
          continue;
        }
        expect(
          size,
          `${where}: ${rule.prelude} { font-size: ${decl['font-size']} } exceeds the door title`
        ).toBeLessThanOrEqual(48);
      }
    }
    expect(seenException, 'should see the wrapped cover year at its named 64px exception').toBe(true);
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

  it('gives a tile with no value one display line of its own', () => {
    /* Safe space is a title and a note. With the note in the foot, a 19px
       title was the whole of what the block carried while the tile beside
       it held a 40px number, and the grid read as a tile that had failed to
       load. */
    const promoted = ruleFor(kit, '.kit-tile:not(:has(.kit-tile-value)) .kit-tile-title')?.body ?? '';
    expect(promoted).toMatch(/font-size:\s*var\(--text-3xl\)/);
    expect(promoted).toMatch(/font-family:\s*var\(--font-display\)/);
    expect(
      ruleFor(kit, ".kit-tile[data-weight='row']:not(:has(.kit-tile-value)) .kit-tile-title")?.body
    ).toMatch(/font-size:\s*var\(--text-2xl\)/);
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
    const bar = rules(kit).find((r) => /--flag-bar/.test(r.prelude) && /::after/.test(r.prelude));
    expect(bar, 'the flag bar rule').toBeTruthy();
    expect(bar!.prelude, "the bar is the tight pair's motif").toMatch(/\[data-tight\]/);
    /* One band of the flag rather than the whole gradient, so the block's
       own colour is not drawn back into its own mark. */
    expect(bar!.body).toMatch(/background:\s*var\(--flag-bar\)/);
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

  it('holds the constellation trail and the curve markers to a guide, not their old 1.25 (ticket 24)', () => {
    const trail = ruleFor(
      styleBlocks('src/lib/components/GenderConstellationChart.svelte'),
      '.cn-trail line'
    )?.body ?? '';
    expect(trail).toMatch(/stroke-width:\s*1\b/);
    expect(trail).toMatch(/stroke:\s*var\(--text-2\)/);

    const marker = ruleFor(styleBlocks('src/lib/components/CurveMarkers.svelte'), '.curve-marker')?.body ?? '';
    expect(marker).toMatch(/stroke-width:\s*1\b/);
    expect(marker).toMatch(/stroke:\s*var\(--text-2\)/);
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

/* Rules 3, 7 and 8: the field, and the sun drawn on it (redesign ticket 23).
   The field is a painted thing on two components, so half of this reads
   markup rather than a sheet: which classes sit inside the field is a fact
   about ScreenHeader.svelte and +page.svelte, and the type rule below is
   asked of those classes. Every assertion here failed against the tree at
   08ada93a, where nothing painted --field. */
describe('rules 7 and 8: the field and the sun (ticket 23)', () => {
  const header = read('src/lib/components/ScreenHeader.svelte');
  const home = read('src/routes/+page.svelte');

  /** The markup between an element's opening tag (found by a data attribute)
      and its matching close, the element's own tag included. Depth is
      counted on the element's own tag name, which is enough for the
      wrappers this asks about. */
  function element(markup: string, attr: string): string {
    const open = new RegExp(String.raw`<([a-z]+)([^<>]*\s${attr}\b[^<>]*)>`).exec(markup);
    if (!open) throw new Error(`no element carries ${attr}`);
    const tag = open[1];
    const re = new RegExp(String.raw`<${tag}\b|</${tag}>`, 'g');
    re.lastIndex = open.index + open[0].length;
    let depth = 1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(markup))) {
      depth += m[0].startsWith('</') ? -1 : 1;
      if (depth === 0) return markup.slice(open.index, m.index + m[0].length);
    }
    throw new Error(`${attr}'s element never closes`);
  }

  /** Every class the markup names inside a fragment: `class="a b"`, the
      static part of `class="a {expr}"`, and `class:name=` directives. */
  function classesIn(fragment: string): Set<string> {
    const out = new Set<string>();
    for (const m of fragment.matchAll(/class="([^"]*)"/g)) {
      for (const token of m[1].replace(/\{[^}]*\}/g, ' ').split(/\s+/)) if (token) out.add(token);
    }
    for (const m of fragment.matchAll(/class:([a-zA-Z0-9_-]+)/g)) out.add(m[1]);
    return out;
  }

  /** A size or weight declaration as a number, through one level of var():
      px and rem for a size, a bare number for a weight, and NaN for what the
      text cannot settle (inherit, a percentage, a cq unit outside clamp).
      A clamp() resolves to its floor, which is the size a narrow screen gets. */
  function resolve(value: string | undefined, base: Record<string, string>): number {
    let v = (value ?? '').trim();
    const varRef = /^var\((--[a-z0-9-]+)\)$/.exec(v);
    if (varRef) v = (base[varRef[1]] ?? '').trim();
    const clamp = /^clamp\(\s*([^,]+),/.exec(v);
    if (clamp) v = clamp[1].trim();
    const rem = /^([\d.]+)rem$/.exec(v);
    if (rem) return Number(rem[1]) * 16;
    const pixels = /^([\d.]+)px$/.exec(v);
    if (pixels) return Number(pixels[1]);
    if (/^\d+$/.test(v)) return Number(v);
    return NaN;
  }

  it('wraps back, title and actions in the field and leaves the subtitle on the page', () => {
    const field = element(header, 'data-screen-field');
    expect(field).toContain('data-screen-back');
    expect(field).toContain('data-screen-title');
    expect(field).toContain('@render actions()');
    expect(field).not.toContain('data-screen-subtitle');
    expect(element(header, 'data-screen-header')).toContain('data-screen-subtitle');
  });

  /* Rule 7's third case, chrome (carpet 25). A door never shows a back
     control and a deep screen always does; chrome shows the field and shows
     a back control on the phone only, which is the one place in rule 7
     where the answer differs by shell. So the control is drawn and then
     dropped inside the 1024px shell's own container query - one rule, in
     the query the bar and the rail already hand over in, rather than a
     width read in script. */
  it('drops the chrome back control in the 1024px shell and nowhere else', () => {
    expect(header).toContain('class:is-chrome={chrome}');
    const dropped = rules(sheet('components')).filter(
      (r) => r.prelude === '.screen-header.is-chrome .screen-back'
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0].at).toBe('@container app (min-width: 1024px)');
    expect(dropped[0].body).toMatch(/display:\s*none/);
  });

  it("paints the screen's field in --field with --field-ink, bleeding to the screen's edges", () => {
    const css = sheet('components');
    const field = ruleFor(css, '.screen-field');
    /* The colour is on the blind rather than on the field itself since
       redesign ticket 28: the box that measures the field and the block
       that paints it move on different clocks during a navigation, so they
       are two elements. What rule 7 asks is that the field is --field with
       --field-ink on it, which is still where both come from. */
    expect(ruleFor(css, '.field-blind')?.body).toMatch(/background:\s*var\(--field\)/);
    expect(field?.body).toMatch(/color:\s*var\(--field-ink\)/);
    /* Sideways to the screen's edges, and no further. The field used to
       bleed up through the window inset as well, to meet the window's own
       top edge; carpet ticket 154 took that back across every field at
       once. Two reasons, in the order they arrived: the status bar's icons
       are drawn by the system over whatever the app painted, and on the
       two screens that draw a sun they crossed its rings and vanished;
       and retiring it on only those two left two field top edges 48px
       apart, which the blind cannot express, since it is one named object
       across a navigation whose top edge does not move. */
    const bleed = ruleFor(css, '.screen > .screen-header > .screen-field');
    expect(bleed?.body).toMatch(/margin:\s*0 calc\(-1 \* var\(--space-5\)\) 0/);
    expect(bleed?.body).toMatch(/padding:\s*var\(--space-8\) var\(--space-5\) var\(--space-4\)/);
  });

  /* The same claim as a sweep rather than as one rule, so a field added
     later cannot quietly reintroduce the bleed: nothing whose selector
     names a field may pull itself up by the top inset. The scroll region
     in app.css is the one place that spends it. */
  it('lets no field cross the top inset', () => {
    const offenders: string[] = [];
    const sources: Array<[string, string]> = [
      ['components', sheet('components')],
      ['screens', sheet('screens')],
      ['+page', styleBlocks('src/routes/+page.svelte')],
      ['onboarding', styleBlocks('src/routes/onboarding/+page.svelte')]
    ];
    for (const [name, css] of sources) {
      for (const rule of rules(css)) {
        if (!/-field\b/.test(rule.prelude)) continue;
        if (/margin[^;]*calc\(\s*-1 \* var\(--inset-top\)/.test(rule.body)) {
          offenders.push(`${name} ${rule.prelude}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /* Rule 7's Transition door (redesign ticket 15): "The field holds the
     search input, set as a block of --bg on the field with --text type, and
     nothing else." That block is also the whole of why 16px type is legal
     up there, so it is asserted rather than left to the small-type rule
     below to happen not to see. */
  it('holds the search box on the Transition door as a block of --bg with page ink', () => {
    const more = read('src/routes/more/+page.svelte');
    const field = /\{#snippet field\(\)\}([\s\S]*?)\{\/snippet\}/.exec(more)?.[1] ?? '';
    expect(field).toContain('class="search-box"');

    const box = ruleFor(sheet('components'), '.screen-field .search-box');
    expect(box?.body).toMatch(/background:\s*var\(--bg\)/);
    expect(ruleFor(sheet('screens'), '.search-input')?.body).toMatch(/color:\s*var\(--text\)/);
  });

  it("puts Today's sun and wordmark in the field, and the hello line, the count and the gear in a foot on the page", () => {
    const field = element(home, 'data-home-field');
    expect(field).toContain('<FlagSun />');
    expect(field).toContain('data-home-hero');
    expect(field).not.toContain('data-home-hello');
    const foot = element(home, 'data-home-foot');
    expect(foot).toContain('data-home-hello');
    expect(foot).toContain('data-home-count');
    expect(foot).toContain('data-home-gear');
    const css = styleBlocks('src/routes/+page.svelte');
    const rule = ruleFor(css, '.home-field');
    /* Today's field paints through the same blind every other door's does
       (redesign ticket 28, components.css); what stays here is the box. */
    expect(field).toContain('data-field-blind');
    expect(rule?.body).toMatch(/color:\s*var\(--field-ink\)/);
    expect(ruleFor(css, '.home-hero')?.body).toMatch(/font-size:\s*clamp\(1\.7rem, 13cqw, 3rem\)/);
  });

  /* Rule 3's floor: nonbinary's purple carries white at 4.41:1, so nothing
     under 24px, or under 18.66px bold, may be set on the field. Asked of
     every rule in the shared sheets and the two components' own blocks
     whose subject is a class the field's markup contains. */
  it('sets no small type on the field', () => {
    const base = baseTokens();
    const fieldClasses = new Set([
      ...classesIn(element(header, 'data-screen-field')),
      ...classesIn(element(home, 'data-home-field'))
    ]);
    expect(fieldClasses.size).toBeGreaterThan(3);
    const sources: Array<[string, string]> = [
      ['components', sheet('components')],
      ['kit', sheet('kit')],
      ['app', sheet('app')],
      ['screens', sheet('screens')],
      ['ScreenHeader', styleBlocks('src/lib/components/ScreenHeader.svelte')],
      ['+page', styleBlocks('src/routes/+page.svelte')]
    ];
    let seen = 0;
    for (const [where, css] of sources) {
      for (const rule of rules(css)) {
        const subjects = rule.prelude.split(',').map((s) => s.trim().split(/\s+|>/).pop() ?? '');
        const onField = subjects.some((s) =>
          [...s.matchAll(/\.([a-zA-Z0-9_-]+)/g)].some((m) => fieldClasses.has(m[1]))
        );
        if (!onField) continue;
        const decl = Object.fromEntries(declarations(rule.body));
        if (!decl['font-size']) continue;
        seen++;
        const size = resolve(decl['font-size'], base);
        const weight = resolve(decl['font-weight'], base);
        const floor = weight >= 700 ? 18.66 : 24;
        expect(
          Number.isNaN(size) || size >= floor,
          `${where}: ${rule.prelude} { font-size: ${decl['font-size']} } is small type on the field`
        ).toBe(true);
      }
    }
    expect(seen, 'the title and the wordmark both set a size').toBeGreaterThanOrEqual(2);
  });

  /* The bands touch and each carries a 3px black seam (Alicja, on the
     first renders: "a fatter stroke and no emptiness between bands"). No
     outline: an outline in the ground's colour was the gap. */
  it('seams the rings with 3px of black and leaves no gap between the bands', () => {
    const sun = ruleFor(sheet('components'), '.sun i');
    expect(sun?.body).not.toMatch(/outline/);
    expect(sun?.body).toMatch(/border:\s*3px solid #000\b/);
    expect(sun?.body).toMatch(/box-sizing:\s*border-box/);
    expect(ruleFor(sheet('components'), '.sun')?.body).toMatch(/transform:\s*scale\(var\(--sun-scale, 1\)\)/);
  });

  it('draws the sun at 0.82 below 360px and 0.6 below 240px', () => {
    const css = styleBlocks('src/routes/+page.svelte');
    const at = (query: string) => rules(css).find((r) => r.at.includes(query) && /\.home-field/.test(r.prelude));
    expect(at('(max-width: 359px)')?.body).toMatch(/--sun-scale:\s*0\.82/);
    expect(at('(max-width: 239px)')?.body).toMatch(/--sun-scale:\s*0\.6\b/);
  });

  it("makes the field a 6px-cornered banner on the web and retires Home's outline frame", () => {
    for (const rule of rules(sheet('screens'))) {
      if (rule.prelude === '.home') expect(rule.body, 'the desktop frame on .home').not.toMatch(/outline/);
    }
    const homeField = rules(styleBlocks('src/routes/+page.svelte')).find(
      (r) => r.at.includes('min-width: 1024px') && r.prelude === '.home-field'
    );
    expect(homeField?.body).toMatch(/border-radius:\s*var\(--r-block\)/);
    const deep = rules(sheet('components')).find(
      (r) => r.at.includes('min-width: 1024px') && /\.screen-field/.test(r.prelude)
    );
    expect(deep?.body).toMatch(/border-radius:\s*var\(--r-block\)/);
  });
});

/* Carpet 30: the bespoke `.card` variants, and grounds.
   ============================================================
   Ticket 20's sweep counted four `.card` variants where the source had
   six, and carpet 28's ground check then found sixty-seven elements
   painting `--surface` or `--surface-2` where rule 4 has three treatments
   and none of them is a tone. Both are held here rather than in a
   comment, because the tonal ground on the three disguise rows survived
   ticket 20 exactly by being written down and not asserted.

   Every assertion below was seen to fail against main at 8ae757fa. */
describe('rule 4: what carpet 30 decided', () => {
  /** The class names each `class="..."` attribute in `file` pairs with
      `card`, which is what a variant is: a modifier on the shared surface.
      Read off the attribute rather than off a stylesheet, since a variant
      only exists where markup asks for one. */
  function cardVariants(file: string): string[] {
    const out: string[] = [];
    for (const [, list] of read(file).matchAll(/class="([^"{}]*)"/g)) {
      const names = list.trim().split(/\s+/);
      if (!names.includes('card')) continue;
      out.push(...names.filter((name) => name !== 'card'));
    }
    return out;
  }

  /* `.card.spread` went with carpet 29, and these three go here: the
     check-in card and the breathing card lose the surface, and
     `.card.no-print` turns out not to be a variant at all - `no-print` is
     app.css's print utility (`display: none !important` inside @media
     print), so that one is a plain `.card` wearing a utility and belongs
     to carpet 21 with the other eighteen. Which leaves the allowlist at
     exactly that one name, and it is here so the next variant somebody
     invents has to argue with a failing test rather than with a sweep
     nobody has re-run. */
  it('leaves no bespoke .card variant in the source', () => {
    const found = new Set<string>();
    for (const file of svelteFiles()) for (const name of cardVariants(file)) found.add(name);
    expect([...found].sort()).toEqual(['no-print']);
  });

  /* The 1.5px `--accent-border` edge was the group saying "this is the
     app's own daily check-in, not a reminder you made", which is a claim
     rule 4 has no treatment for. The row's own title says it in words. */
  it('takes the box off the check-in group and retires its rule', () => {
    const screen = read('src/routes/settings/reminders/+page.svelte');
    expect(screen).not.toMatch(/checkin-card/);
    expect(stripComments(read(SHEETS.screens))).not.toMatch(/checkin-card/);
  });

  /* The breathing exercise is a ring, and a ring is the object rather than
     something that needs a container to say it is one. Its two grounds went
     with the card: `--bg-card` and `--bg-subtle` are declared nowhere in
     the token layer, so both had been resolving to nothing since the token
     pass - the card around them was the only ground the surface had. */
  it('takes the box off the breathing exercise and the two dead grounds with it', () => {
    const file = 'src/lib/components/BreathingExercise.svelte';
    /* The class attributes rather than the file, since the comment above the
       markup has to be allowed to say what it stopped being. */
    for (const [, list] of read(file).matchAll(/class="([^"{}]*)"/g))
      expect(list.trim().split(/\s+/), file).not.toContain('card');
    expect(styleBlocks(file)).not.toMatch(/--bg-(card|subtle)/);
  });

  /* The ground rule itself, on the one spelling that can put a tone under a
     container without any stylesheet saying so. Both instances were on
     `/settings/export`'s two import previews, and each also carried a
     `box-shadow: none` that ticket 20 had already made redundant. */
  it('grounds no container with a tonal fill', () => {
    for (const file of svelteFiles()) {
      for (const [, style] of read(file).matchAll(/style="([^"{}]*)"/g)) {
        expect(style, `${file} grounds a container inline`).not.toMatch(
          /background:\s*var\(--surface(-2)?\)/
        );
      }
    }
  });
});
