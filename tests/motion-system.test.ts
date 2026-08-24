/* The motion system set out in DIRECTION.md, which lives on ticket 15's
   branch, at the level a stylesheet can be held to.

   The load-bearing one is the reduced-motion invariant. Both reduced-motion
   paths in theme/base.css work by forcing every duration to 1ms rather than
   by cancelling anything, which means an animation still runs - it just
   runs instantly. An animation that ends somewhere other than where its
   element rests therefore does not become "unanimated" under the clamp; it
   becomes an element stranded at the wrong size, offset or opacity, with no
   motion to explain why. That is worse than the motion it replaced, and it
   is invisible to every other test in the suite because the stylesheet is
   perfectly valid.

   So: every animation's end state has to be the element's resting state.
   The three ways an animation is allowed to satisfy that are all accepted
   below - stop under reduced motion, fill forwards so the end state is the
   resting state, or end on the same values the base rule already declares. */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

const SHEETS = [
  'src/lib/theme/base.css',
  'src/lib/motion/press.css',
  'src/lib/motion/materials.css',
  'src/lib/styles/app.css',
  'src/lib/styles/components.css',
  'src/lib/styles/screens.css'
];

type Rule = { prelude: string; body: string; context: string[] };

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Flattens a stylesheet into rules, each carrying the at-rules it sits
    inside, so a `.foo` at the top level and a `.foo` inside a
    prefers-reduced-motion block stay distinguishable. */
function rules(css: string, context: string[] = []): Rule[] {
  const out: Rule[] = [];
  let depth = 0;
  let start = 0;
  let blockStart = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) blockStart = i;
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        const prelude = css.slice(start, blockStart).trim();
        const body = css.slice(blockStart + 1, i);
        if (/^@(media|supports)/.test(prelude)) out.push(...rules(body, [...context, prelude]));
        else out.push({ prelude, body, context });
        start = i + 1;
      }
    }
  }
  return out;
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, prop, value] of body.matchAll(/([a-z-]+)\s*:\s*([^;}]+)/g)) out[prop.trim()] = value.trim();
  return out;
}

/** The frames of one @keyframes block, keyed by their stop. */
function frames(body: string) {
  return rules(body).map((frame) => ({ stops: frame.prelude, decls: declarations(frame.body) }));
}

/** Values a property has when nothing declares it, for the properties an
    animation in this app actually touches. */
const INITIAL: Record<string, string> = {
  transform: 'none',
  opacity: '1',
  'background-position': '0% 0%'
};

function normalise(prop: string, value: string | undefined) {
  const resolved = (value ?? INITIAL[prop] ?? '').trim();
  /* `transform: none` and no transform at all are the same rendered state,
     and so are `0` and `0px` inside one. */
  return resolved.replace(/\s+/g, ' ').replace(/\b0px\b/g, '0');
}

const sheets = SHEETS.map((path) => ({ path, css: stripComments(readFileSync(join(root, path), 'utf8')) }));

/** Every `<style>` block in the app's components and routes, comments
    stripped, for the one check that has to hold outside the shared sheets. */
function svelteStyleBlocks(): { path: string; css: string }[] {
  const out: { path: string; css: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.svelte')) {
        const source = readFileSync(full, 'utf8');
        for (const [, block] of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
          out.push({ path: full.slice(root.length), css: stripComments(block) });
        }
      }
    }
  };
  walk(join(root, 'src'));
  return out;
}
const allRules = sheets.flatMap(({ path, css }) => rules(css).map((rule) => ({ ...rule, path })));

const isReduceContext = (rule: Rule) =>
  rule.context.some((at) => at.includes('prefers-reduced-motion')) ||
  rule.prelude.includes("data-a11y-motion='reduce'");

/** Selectors that cannot be stranded because they are turned off under
    BOTH reduced-motion paths - either the animation is cancelled, which is
    the escape the five decorative loops take (MO-001), or the element is
    not rendered at all, which is the skeleton sweep's (MO-002). */
function stoppedUnderReduce() {
  const viaMedia = new Set<string>();
  const viaToggle = new Set<string>();
  for (const rule of allRules) {
    if (!/(animation(-name)?|display):\s*none/.test(rule.body)) continue;
    for (const selector of rule.prelude.split(',').map((s) => s.trim())) {
      if (rule.context.some((at) => at.includes('prefers-reduced-motion'))) viaMedia.add(selector);
      if (selector.includes("data-a11y-motion='reduce'")) {
        viaToggle.add(selector.replace(/^html\[data-a11y-motion='reduce'\]\s*/, ''));
      }
    }
  }
  return new Set([...viaMedia].filter((selector) => viaToggle.has(selector)));
}

describe('the reduced-motion invariant', () => {
  it('ends every animation where its element rests', () => {
    const keyframes = new Map<string, ReturnType<typeof frames>>();
    for (const rule of allRules) {
      const name = /^@keyframes\s+(\S+)/.exec(rule.prelude)?.[1];
      if (name) keyframes.set(name, frames(rule.body));
    }
    expect(keyframes.size, 'no @keyframes found - the parser has drifted from the stylesheets').toBeGreaterThan(0);

    const stopped = stoppedUnderReduce();
    const problems: string[] = [];

    for (const rule of allRules) {
      if (isReduceContext(rule) || rule.prelude.startsWith('@')) continue;
      const shorthand = declarations(rule.body).animation;
      if (!shorthand || shorthand === 'none') continue;

      const name = shorthand.split(/\s+/)[0];
      const frameList = keyframes.get(name);
      if (!frameList) continue; // an animation defined in a sheet this test does not read
      const selectors = rule.prelude.split(',').map((s) => s.trim());
      if (selectors.every((selector) => stopped.has(selector))) continue;
      /* `forwards`/`both` holds the last frame after the animation ends, so
         the end state IS the resting state and there is nothing to strand. */
      if (/\b(forwards|both)\b/.test(shorthand)) continue;

      const last = frameList.find((f) => /(^|,\s*)(to|100%)\s*$/.test(f.stops));
      if (!last) {
        problems.push(`${rule.path}: ${name} has no 'to'/100% frame, so its end state is unstated`);
        continue;
      }

      /* The resting rule: every top-level declaration written against this
         exact selector, wherever in the sheets it lives. */
      const resting: Record<string, string> = {};
      for (const other of allRules) {
        if (isReduceContext(other) || other.context.length > 0) continue;
        if (other.prelude.trim() !== rule.prelude.trim()) continue;
        Object.assign(resting, declarations(other.body));
      }

      for (const [prop, value] of Object.entries(last.decls)) {
        const ends = normalise(prop, value);
        const rests = normalise(prop, resting[prop]);
        if (ends === rests) continue;
        problems.push(
          `${rule.path}: ${rule.prelude} runs ${name}, which ends at ${prop}: ${ends}, ` +
            `but the element rests at ${prop}: ${rests}. Under the 1ms clamp that strands it there. ` +
            `Declare the resting value, fill the animation forwards, or stop it under both reduced-motion paths.`
        );
      }
    }

    expect(problems).toEqual([]);
  });
});

describe('tier 1, response', () => {
  it('presses on the spring token rather than a hand-written curve', () => {
    const press = readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8');
    expect(press).toContain('var(--ease-press)');
    expect(press).toContain('var(--dur-press)');
    expect(press).toMatch(/\.press:active\s*\{\s*transform:\s*scale\(0\.94\)/);
    expect(press).toMatch(/\.press-add:active\s*\{\s*transform:\s*scale\(0\.9\)/);
  });

  it('drops the transform and keeps the rest under both reduced-motion paths', () => {
    const press = stripComments(readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8'));
    const reduced = rules(press).filter(isReduceContext);
    const covered = new Set(
      reduced
        .filter((rule) => /transform:\s*none/.test(rule.body))
        .flatMap((rule) => rule.prelude.split(',').map((s) => s.trim().replace(/^html\[data-a11y-motion='reduce'\]\s*/, '')))
    );
    expect([...covered].sort()).toEqual(['.press-add:active', '.press:active']);
  });

  /* Phase 5 ticket 28: the press also collapses the one floating control's
     shadow, so the button reads as meeting the surface rather than shrinking
     in place. Capped to that control - it is the app's only element with a
     shadow to collapse, and a 56px repaint is the smallest area any of this
     ticket's materials touch. */
  it('collapses the floating control shadow on the same duration as the scale', () => {
    const press = readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8');
    expect(press).toMatch(/transition:[^;]*box-shadow var\(--dur-press\) var\(--ease-press\)/);
    expect(press).toMatch(/\.press-add:active\s*\{[^}]*box-shadow:\s*var\(--shadow-float-pressed\)/);
  });

  it('leaves the shadow of every other control alone, which is the cap', () => {
    const press = stripComments(readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8'));
    for (const rule of rules(press)) {
      if (!/box-shadow/.test(rule.body)) continue;
      expect(rule.prelude, 'only the floating control animates a shadow').not.toMatch(/\.press[,:]|\.press$/);
    }
  });

  it('restores the resting shadow under both reduced-motion paths', () => {
    const press = stripComments(readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8'));
    const restored = rules(press)
      .filter(isReduceContext)
      .filter((rule) => /box-shadow:\s*var\(--shadow-float\)/.test(rule.body))
      .flatMap((rule) =>
        rule.prelude.split(',').map((s) => s.trim().replace(/^html\[data-a11y-motion='reduce'\]\s*/, ''))
      );
    expect(restored.filter((selector) => selector === '.press-add:active')).toHaveLength(2);
  });

  it('is loaded by the app shell', () => {
    expect(readFileSync(join(root, 'src/routes/+layout.svelte'), 'utf8')).toContain("import '$lib/motion/press.css'");
  });
});

describe('tier 2, the withdrawal', () => {
  const materials = () => readFileSync(join(root, 'src/lib/motion/materials.css'), 'utf8');

  /* The material is a blur that is there or not there, never a blur that
     changes radius - the reason is written out once, at --blur-withdraw in
     theme/base.css. */
  it('holds the blur radius constant and animates opacity alone', () => {
    /* The reduced-motion rules are the substitute, not the material: they
       set the radius to none, which is the whole point of them. */
    const scrim = rules(stripComments(materials())).filter(
      (rule) => rule.prelude.includes('.scrim-withdraw') && !isReduceContext(rule)
    );
    expect(scrim.length, 'the tier-2 withdrawal has to exist to be capped').toBeGreaterThan(0);

    for (const rule of scrim) {
      const declared = declarations(rule.body);
      if (declared['backdrop-filter']) {
        expect(declared['backdrop-filter'], 'the radius is a token, not a number').toContain(
          'var(--blur-withdraw)'
        );
      }
      const transition = declared.transition ?? '';
      expect(transition, 'a transition that names a filter animates its radius').not.toMatch(/filter/);
      expect(transition, 'transition: all would animate the radius by accident').not.toMatch(/\ball\b/);
    }
  });

  it('falls back to a deliberate flat scrim where backdrop-filter is missing', () => {
    const supports = rules(stripComments(materials())).filter((rule) =>
      rule.context.some((at) => at.includes('backdrop-filter'))
    );
    expect(supports.length, 'the fallback is a @supports state, not an unstyled one').toBeGreaterThan(0);
  });

  it('drops the blur under both reduced-motion paths and keeps the tint', () => {
    const reduced = rules(stripComments(materials())).filter(isReduceContext);
    const dropped = reduced
      .filter((rule) => /backdrop-filter:\s*none/.test(rule.body))
      .flatMap((rule) =>
        rule.prelude.split(',').map((s) => s.trim().replace(/^html\[data-a11y-motion='reduce'\]\s*/, ''))
      );
    expect(dropped.filter((selector) => selector === '.scrim-withdraw')).toHaveLength(2);
    for (const rule of reduced) {
      expect(rule.body, 'the substitute keeps the scrim, it just stops withdrawing').not.toMatch(
        /display:\s*none/
      );
    }
  });
});

describe('the cap that spans every material', () => {
  /* A keyframe blur ramp is the expensive shape this ticket is deliberately
     not shipping: every frame re-blurs the region at a new radius.

     This is the one check that has to reach past SHEETS. Every other rule
     here is about a primitive that lives in a shared stylesheet, but a
     keyframe can be written in any component's own <style> block, and the
     screen tickets are about to write a lot of those. A cap that only covers
     the six shared sheets would go quietly vacuous exactly when it starts to
     matter. */
  it('interpolates no blur radius anywhere, component styles included', () => {
    const offenders: string[] = [];

    for (const rule of allRules) {
      if (!rule.prelude.startsWith('@keyframes')) continue;
      if (rule.body.includes('blur(')) offenders.push(`${rule.path}: ${rule.prelude}`);
    }

    const components = svelteStyleBlocks();
    expect(components.length, 'no component <style> blocks found - the walk has drifted').toBeGreaterThan(0);
    for (const { path, css } of components) {
      for (const rule of rules(css)) {
        if (!rule.prelude.startsWith('@keyframes')) continue;
        if (rule.body.includes('blur(')) offenders.push(`${path}: ${rule.prelude}`);
      }
    }

    expect(offenders, 'a blur radius may be present or absent, never interpolated').toEqual([]);
  });
});

describe('the token layer behind the five tiers', () => {
  /* Every tier in DIRECTION.md has to be expressible without anyone
     reaching for a number: tier 0 the sun's arrival and its breath, tier 1
     the press, tier 2 navigation, tier 3 change within a screen, tier 4
     nothing at all. */
  it('names a duration and an easing for each tier that moves', () => {
    const base = readFileSync(join(root, 'src/lib/theme/base.css'), 'utf8');
    for (const token of [
      '--dur-authored',
      '--dur-breathe',
      '--dur-press',
      '--dur-med',
      '--dur-slow',
      '--dur-crossfade',
      '--ease-press',
      '--ease-out',
      '--ease-spring',
      /* Phase 5 ticket 28's two new materials that are expressed as tokens:
         the withdrawal's fixed blur radius and the pressed step of the app's
         one shadow. The third, tier 3's wipe, is geometry rather than a
         value and lives in $lib/motion/reveal.ts. */
      '--blur-withdraw',
      '--scrim-withdraw',
      '--shadow-float-pressed'
    ]) {
      expect(base, `${token} is what a tier reaches for instead of a number`).toContain(`${token}:`);
    }
  });

  it('leaves --dur-breathe out of the clamp, because a 1ms infinite loop is a strobe', () => {
    const base = stripComments(readFileSync(join(root, 'src/lib/theme/base.css'), 'utf8'));
    for (const rule of rules(base).filter(isReduceContext)) {
      expect(rule.body, 'clamping an infinite loop restarts it every millisecond (MO-001)').not.toContain(
        '--dur-breathe'
      );
    }
  });
});
