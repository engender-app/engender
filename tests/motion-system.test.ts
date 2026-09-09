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
   resting state, or end on the same values the base rule already declares.

   Greps, and nothing else is possible (ticket 08): a stylesheet has no
   interface to call. What is asserted is that a declaration is present or
   absent in a CSS file, which is the only form the invariant takes until
   something renders. */

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
  'src/lib/styles/kit.css',
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

/** Every .svelte file's path and full source, under src/. */
function svelteFiles(): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.svelte')) out.push({ path: full.slice(root.length), source: readFileSync(full, 'utf8') });
    }
  };
  walk(join(root, 'src'));
  return out;
}

/** Every `<style>` block in the app's components and routes, comments
    stripped, for the one check that has to hold outside the shared sheets. */
function svelteStyleBlocks(): { path: string; css: string }[] {
  const out: { path: string; css: string }[] = [];
  for (const { path, source } of svelteFiles()) {
    for (const [, block] of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      out.push({ path, css: stripComments(block) });
    }
  }
  return out;
}
/** The comma-separated parts of one property value, ignoring the commas
    inside a function like cubic-bezier() or linear(). */
function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === ',' && depth === 0) {
      out.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(value.slice(start).trim());
  return out;
}

/** The whitespace-separated words of one shorthand part, ignoring the
    whitespace inside a function - so `var(--a, var(--b))` stays one word
    however many spaces it carries. */
function words(part: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= part.length; i++) {
    const at = part[i];
    if (at === '(') depth++;
    else if (at === ')') depth--;
    else if ((at === undefined || /\s/.test(at)) && depth === 0) {
      const word = part.slice(start, i).trim();
      if (word) out.push(word);
      start = i + 1;
    }
  }
  return out;
}

/** The shared sheets plus every component's own <style> block. A curve can
    be written in either, so the checks about which curves exist read both. */
function styleSources() {
  return [...sheets, ...svelteStyleBlocks()];
}

/* styleSources(), not sheets alone (phase 5 audit ticket 16): a screen's
   @keyframes can live in its own component now that screens.css's clusters
   are moving into their owners, and "the cap that spans every material"
   below already names the risk this closes - a check that only read the six
   shared sheets would go quietly vacuous exactly when it started to matter. */
const allRules = styleSources().flatMap(({ path, css }) => rules(css).map((rule) => ({ ...rule, path })));

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
        /* Two spellings of the same escape. A shared stylesheet writes the
           toggle bare; a component's <style> has to wrap it in :global(),
           because the html element is not in the component and Svelte
           would otherwise scope the selector onto it. Both mean "this
           animation is cancelled under the toggle", so both have to strip
           back to the selector the media-query rule names, or the
           component form silently fails to pair with it (phase 9 audit
           ticket 11, found by Progress.svelte's indeterminate sweep). */
        viaToggle.add(
          selector.replace(/^(?::global\(html\[data-a11y-motion='reduce'\]\)|html\[data-a11y-motion='reduce'\])\s*/, '')
        );
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

/** Ticket 15's opt-outs from the default press, each with why. A new one
    has to be added here as well as in the markup - the test cross-checks
    both directions, so an addition or removal on one side without the
    other fails instead of drifting quietly. */
const PRESS_OPT_OUTS: { file: string; count: number; reason: string }[] = [
  {
    file: 'src/lib/components/Segmented.svelte',
    count: 2,
    reason: "the pill crossing the set is already the response; scaling the label too answers the same touch twice"
  },
  {
    file: 'src/lib/components/CurveMarkers.svelte',
    count: 1,
    reason: 'fill: transparent - an invisible hit target has nothing visible to press; the mark it stands over answers instead'
  },
  {
    file: 'src/lib/components/HormoneBandChart.svelte',
    count: 1,
    reason: 'fill: transparent - an invisible hit target has nothing visible to press'
  },
  {
    file: 'src/lib/components/LineChart.svelte',
    count: 1,
    reason: 'fill: transparent - an invisible hit target has nothing visible to press'
  },
  {
    file: 'src/lib/components/kit/BarRows.svelte',
    count: 1,
    reason:
      'a bar row is the width of its card and fills with a wash instead; the compact depth walked a 306px row 9.2px inward on every tap (carpet ticket 10)'
  },
  {
    file: 'src/routes/onboarding/+page.svelte',
    count: 1,
    reason:
      "the restore step's file block is the width of the step and fills with a wash instead; the compact depth walked a 358px block 10.7px inward with the question and the rule holding still (redesign ticket 36)"
  },
  {
    file: 'src/lib/components/kit/DayEntry.svelte',
    count: 1,
    reason: 'an entry row in a day card is list content being read, not a control - the row press read as text jumping (ticket 99 item 10)'
  },
  {
    file: 'src/lib/components/kit/ListRow.svelte',
    count: 5,
    reason: 'the row scale made a tapped list jump sideways; the row is the list, not a button on it (ticket 99 item 10)'
  },
  {
    file: 'src/lib/components/TodayEditor.svelte',
    count: 1,
    reason:
      'the drag handle is held rather than tapped - a press scale on the grip would fight the translate that follows the pointer (redesign ticket 14)'
  },
  {
    file: 'src/lib/components/SpanTimeline.svelte',
    count: 3,
    reason:
      'the rail answers a touch by moving the span itself - a handle follows the finger and the clip travels - so a scale on an era, a mark or a handle would be a second answer to the same touch (redesign ticket 11)'
  }
];

describe('tier 1, response', () => {
  it('presses on the spring token rather than a hand-written curve', () => {
    const press = readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8');
    expect(press).toContain('var(--ease-press)');
    expect(press).toContain('var(--dur-press)');
  });

  /* Ticket 15: press inverted from opt-in to opt-out. A `.press` class 81
     call sites had to remember and 52 controls did not is replaced by one
     rule keyed on being an interactive element inside the app root, so a
     control presses because it is a control - the class is no longer what
     grants it. [data-no-press] is the escape hatch, enumerated above. */
  it('presses any button, link or role="button" in the app by default, with no class to remember', () => {
    const press = stripComments(readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8'));
    const DEFAULT_SELECTOR = "[data-app-root] :is(button, a, [role='button']):not([data-no-press])";
    const wrapped = `:where(${DEFAULT_SELECTOR})`;

    const base = rules(press).find((rule) => rule.prelude === wrapped);
    expect(base, `${wrapped} should exist, unconditioned`).toBeDefined();
    expect(declarations(base?.body ?? '').transition).toBe('transform var(--dur-press) var(--ease-press)');

    const active = rules(press).find((rule) => rule.prelude === `${wrapped}:active`);
    expect(active, `${wrapped}:active should exist`).toBeDefined();
    expect(declarations(active?.body ?? '').transform).toBe('scale(var(--press-depth))');
  });

  /* :where() is what makes this opt-out safe: it holds the default at zero
     specificity, so .icon-btn and .btn's own transition-property lists
     (background, box-shadow, filter alongside transform) still win outright
     rather than being replaced by a default that only knows about
     transform. A real selector here would strand every other property those
     two classes transition. */
  it('holds the default at zero specificity, via :where(), so a class with its own transition list still wins', () => {
    const press = stripComments(readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8'));
    for (const rule of rules(press)) {
      if (!rule.prelude.includes(":is(button, a, [role='button'])")) continue;
      expect(rule.prelude, rule.prelude).toMatch(/^:where\(/);
    }
  });

  /* Phase 5 ticket 30. The depths used to be literals in four places, and
     .btn's 0.97 and the primitive's 0.94 disagreed with nothing to say which
     was right. They are three tokens now, one per size class, declared in
     press.css and nowhere else - so a control names the class it belongs to
     and cannot invent a fifth number. */
  it('writes the three depths once, in press.css', () => {
    const press = stripComments(readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8'));
    const declared = rules(press).find((rule) => rule.prelude === ':root' && !isReduceContext(rule));
    expect(declarations(declared?.body ?? '')).toMatchObject({
      '--press-depth': '0.94',
      '--press-depth-wide': '0.97',
      '--press-depth-add': '0.9'
    });
  });

  it('leaves no press depth written as a literal anywhere else', () => {
    const literals: string[] = [];
    for (const { path, css } of [...sheets, ...svelteStyleBlocks()]) {
      if (path.endsWith('motion/press.css')) continue;
      for (const rule of rules(css)) {
        if (!rule.prelude.includes(':active')) continue;
        const scale = rule.body.match(/(?:transform:\s*scale|scale:)\s*([^;}]+)/)?.[1];
        if (scale && /[0-9]/.test(scale) && !scale.includes('--press-depth')) {
          literals.push(`${path}: ${rule.prelude} { ${scale.trim()} }`);
        }
      }
    }
    expect(literals).toEqual([]);
  });

  /* Reduced motion substitutes rather than deletes, and it does it by taking
     the depth to 1 rather than by naming every pressable selector. A control
     added later inherits the substitute instead of having to remember it,
     which is the failure the enumerated version invited. */
  it('takes every depth to 1 under both reduced-motion paths', () => {
    const press = stripComments(readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8'));
    const reduced = rules(press).filter(isReduceContext).filter((rule) => /--press-depth/.test(rule.body));
    expect(reduced.length, 'both reduced-motion paths are covered').toBe(2);
    for (const rule of reduced) {
      expect(declarations(rule.body)).toMatchObject({
        '--press-depth': '1',
        '--press-depth-wide': '1',
        '--press-depth-add': '1'
      });
    }
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

  /* Phase 5 ticket 29: --ease-press is a sampled spring, and the sample is
     260ms long. --dur-fast cuts it at 150ms, which is after the control has
     arrived (94% by 44ms) but well before the overshoot has settled, so the
     control snaps to its resting size instead of springing back to it. The
     curve and the duration are one decision, and a rule that takes half of
     it gets the worse half. */
  it('never cuts the spring short by pairing it with another duration', () => {
    const stray: string[] = [];
    for (const { path, css } of styleSources()) {
      for (const rule of rules(css)) {
        const declared = declarations(rule.body);
        const where = `${path}: ${rule.prelude}`;

        /* A shorthand carries the pair inside one segment. */
        for (const segment of splitTopLevel(declared.transition ?? '')) {
          if (!segment.includes('var(--ease-press)')) continue;
          if (!segment.includes('var(--dur-press)')) stray.push(`${where} { transition: ... ${segment} }`);
        }

        /* Longhands carry it by position, and a list shorter than the
           property list repeats from its start rather than running out, so
           the duration belonging to curve n is n wrapped by the list's own
           length. Indexing straight would fail a rule that names one
           duration for two curves, which is legal and correct CSS. */
        const curves = splitTopLevel(declared['transition-timing-function'] ?? '');
        const durations = splitTopLevel(declared['transition-duration'] ?? '');
        curves.forEach((curve, i) => {
          if (curve !== 'var(--ease-press)') return;
          if (durations[i % durations.length] !== 'var(--dur-press)') {
            stray.push(`${where} { --ease-press at ${i}, but --dur-press is not }`);
          }
        });
      }
    }

    expect(stray, 'the spring needs its whole 260ms or it snaps instead of settling').toEqual([]);
  });

  /* A shorthand may name --ease-press only if the press is all of it: on a
     WebView too old to parse the linear(), the whole shorthand is lost, not
     just the press. Why that happens is at --ease-press in theme/base.css. */
  it('never puts the spring in a shorthand beside a property it would strand', () => {
    const mixed: string[] = [];
    for (const { path, css } of styleSources()) {
      for (const rule of rules(css)) {
        const transition = declarations(rule.body).transition;
        if (!transition?.includes('var(--ease-press)')) continue;
        const segments = splitTopLevel(transition);
        if (segments.length > 1 && segments.some((s) => !s.includes('var(--ease-press)'))) {
          mixed.push(`${path}: ${rule.prelude} { transition: ${transition} }`);
        }
      }
    }

    expect(mixed, 'an unparseable linear() takes the whole shorthand with it, not just its own half').toEqual([]);
  });

  /* Ticket 29 settled two depths on a Pixel 10a and they did not land in the
     same place; ticket 30 found the reason and turned it into a rule. Scale
     is a fraction, so one fraction moves a 320px button's edge several times
     as far as a 48px key's. The three depths are three size classes of one
     law - the bigger the control, the shallower the fraction.

     Ticket 15 dropped .icon-btn, .switch and .pin-key from this list: they
     used to restate the compact depth themselves and now take it from the
     default like any other plain control, so there is nothing of theirs
     left to check here - the "no second owner" test below covers their
     absence instead. Only the two deliberate exceptions remain. */
  it('presses .btn and .press-add to the depth chosen for their size, both in press.css', () => {
    const press = stripComments(readFileSync(join(root, 'src/lib/motion/press.css'), 'utf8'));
    const depthOf = (selector: string) =>
      rules(press).find((rule) => rule.prelude === selector && !isReduceContext(rule))?.body.match(
        /transform:\s*(scale\([^;]*\))/
      )?.[1];

    expect(depthOf('.btn:active'), '.btn is the wide class, not a number of its own').toBe(
      'scale(var(--press-depth-wide))'
    );
    expect(depthOf('.press-add:active'), 'the add button is the deeper of the three').toBe(
      'scale(var(--press-depth-add))'
    );

    /* .segment opted out (ticket 15, [data-no-press]) rather than being
       enumerated here: it is the third control that answers a press without
       shrinking, and DIRECTION.md's tier 1 says every one of those has to
       say why - the pill crossing the set is already the response, and
       scaling the label as well is two answers to one press. What is
       pinned here is that it still answers at all - a control that does
       nothing under the finger is the thing tier 1 exists to prevent. */
    const components = stripComments(readFileSync(join(root, 'src/lib/styles/components.css'), 'utf8'));
    const segment = rules(components).find((rule) => rule.prelude === '.segment:active' && !isReduceContext(rule));
    expect(segment, '.segment still answers a press').toBeDefined();
    expect(segment?.body, '.segment answers with colour, not with a transform').not.toMatch(/transform|scale:/);
    expect(segment?.body, '.segment answers with something').toMatch(/color:/);
  });

  it('gives the two add controls the press primitive instead of their own depth', () => {
    const nav = readFileSync(join(root, 'src/lib/components/AppNav.svelte'), 'utf8');

    for (const handle of ['data-nav-fab', 'data-rail-add']) {
      const tag = nav.match(new RegExp(`<button[^>]*${handle}[^>]*>`, 's'))?.[0];
      expect(tag, `${handle} exists`).toBeDefined();
      expect(tag, `${handle} carries .press-add`).toContain('press-add');
    }
  });

  /* The shell declaring a depth of its own is the state ticket 15 replaced.
     This used to read only app.css, which is why it never saw .icon-btn,
     .btn, .switch and .pin-key's own :active rules living one file over, in
     components.css - four owners the "shell" check was never pointed at.
     Every stylesheet, every component <style> block, everything but
     press.css itself: any :active rule elsewhere that names `transform` is
     a second owner come back, whether it is app.css's old .nav-fab number
     or a class this ticket never heard of. */
  it('is the only stylesheet that presses a control with its own :active rule', () => {
    const restated: string[] = [];
    for (const { path, css } of [...sheets, ...svelteStyleBlocks()]) {
      if (path.endsWith('motion/press.css')) continue;
      for (const rule of rules(css)) {
        if (isReduceContext(rule)) continue;
        /* A selector is only a press rule if :active names the element
           itself - :not(:active) (the app's hover-vs-press exposure fix,
           ticket 18) is the opposite of that and has to be stripped first
           or every hover rule it guards reads as a second press owner. */
        if (!rule.prelude.replace(/:not\([^)]*\)/g, '').includes(':active')) continue;
        /* And only a `scale(...)` restates a depth - `transform: none`
           (the disabled-key guard, harmless and pre-existing) is not one. */
        if (/scale\(/.test(declarations(rule.body).transform ?? '')) restated.push(`${path}: ${rule.prelude}`);
      }
    }
    expect(restated, 'no stylesheet outside press.css presses a control with its own :active rule').toEqual([]);
  });

  /* Ticket 15's escape hatch: [data-no-press], a short, known list rather
     than the unbounded set of participants a class-based allowlist would
     have to keep pace with. Cross-checked in both directions against
     PRESS_OPT_OUTS above, so an opt-out added to markup with no matching
     entry here fails, and so does an entry here with nothing left to point
     at - the list can only drift by being wrong in this file. */
  it('enumerates every opt-out from the default press, each with a reason', () => {
    const files = svelteFiles();
    const actual = files
      .map((f) => ({
        file: f.path,
        /* Markup only - several call sites also explain data-no-press by
           name in an HTML comment right above it, which would double-count
           if comments were not stripped first. */
        count: (f.source.replace(/<!--[\s\S]*?-->/g, '').match(/data-no-press/g) ?? []).length
      }))
      .filter((f) => f.count > 0);

    expect(actual.map((a) => a.file).sort(), 'the opt-out list is exactly this enumeration, not a superset').toEqual(
      PRESS_OPT_OUTS.map((o) => o.file).sort()
    );
    for (const expected of PRESS_OPT_OUTS) {
      const found = actual.find((a) => a.file === expected.file);
      expect(found?.count, `${expected.file}: ${expected.reason}`).toBe(expected.count);
    }
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

  it('takes --stagger-step to 0 under both reduced-motion paths, beside the duration clamp', () => {
    /* animation-duration: 1ms !important below covers the growth, never the
       delay - a staggered set still arrived member by member, just each one
       instantly. --stagger-step has to be zeroed at the token, next to the
       five --dur-* tokens it sits beside in :root. */
    const base = stripComments(readFileSync(join(root, 'src/lib/theme/base.css'), 'utf8'));
    const clamped = rules(base).filter(isReduceContext).filter((rule) => rule.body.includes('--dur-fast'));
    expect(clamped.length, 'both reduced-motion paths declare the duration-clamp block').toBe(2);
    for (const rule of clamped) {
      expect(rule.body, 'a stagger member still waits its own turn otherwise').toContain('--stagger-step: 0ms');
    }
  });

  /* The other half of that, and the one the clamp cannot cover on its own.
     `animation-duration: 1ms !important` and its transition twin reach every
     duration in the app whatever it was written as, but neither touches a
     delay - so a delay written as a literal survives reduced motion at full
     length. On its own that is a pause before an instant animation, which is
     merely wrong; on a staged pair of edges it is worse, because the two
     halves of one shape come apart. Redesign ticket 26's highlight is that
     staged pair: its trailing edge waits --stagger-step, which the block
     above zeroes, and a literal 50ms in its place would hold the shape open
     for 50ms under a setting whose whole promise is that nothing moves.

     So every delay in the app is either zero or built out of a token the
     clamp reaches. Longhands and the fourth slot of a shorthand both, since
     that slot is where a delay is most easily written by hand and least
     easily noticed. */
  it('writes no delay the reduced-motion clamp cannot reach', () => {
    const TIME = /^-?[\d.]+m?s$/;
    const ZERO = /^-?0m?s$/;
    const stopped = stoppedUnderReduce();
    /* A delay on an animation that is cancelled outright under both paths
       has nothing to delay, which is the escape the decorative loops take
       (MO-001) - and their delays are literal because their durations are
       too. `.bloom i` is the rule that gets cancelled and
       `.bloom i:nth-child(2)` the one that carries the delay, so a stopped
       selector counts for the same element further qualified. */
    const reasserts = new Map<string, boolean>();
    for (const rule of allRules) {
      if (isReduceContext(rule) || rule.prelude.startsWith('@')) continue;
      const decls = declarations(rule.body);
      const names = decls.animation ?? decls['animation-name'] ?? '';
      if (!names || names === 'none') continue;
      for (const selector of rule.prelude.split(',').map((s) => s.trim())) reasserts.set(selector, true);
    }
    const isStopped = (selector: string) =>
      stopped.has(selector) ||
      /* A stopped selector covers the same element further qualified - but
         only while the qualified rule does not name an animation of its own.
         `.bloom i` is cancelled and `.bloom i:nth-child(2)` only adds a
         delay, so the delay is dead; a qualified rule that re-declared
         `animation` at higher specificity would be alive again and its
         delay would outlive the clamp, which prefix matching alone cannot
         see. */
      [...stopped].some(
        (base) =>
          selector.startsWith(base) &&
          /^[:[]/.test(selector.slice(base.length)) &&
          !reasserts.get(selector)
      );
    const offenders: string[] = [];

    for (const { path, css } of styleSources()) {
      for (const rule of rules(css)) {
        if (rule.prelude.startsWith('@')) continue;
        if (rule.prelude.split(',').every((selector) => isStopped(selector.trim()))) continue;
        for (const [prop, value] of Object.entries(declarations(rule.body))) {
          const delays: string[] = [];
          if (prop === 'animation-delay' || prop === 'transition-delay') {
            delays.push(...splitTopLevel(value));
          } else if (prop === 'animation' || prop === 'transition') {
            /* name/property, duration, easing, delay. Only the fourth slot
               is a delay; the second is a duration and already clamped.
               Split at paren depth zero, or a `var(--x, var(--y))` fallback
               would be read as two slots and the real fourth one missed. */
            for (const part of splitTopLevel(value)) delays.push(words(part)[3] ?? '');
          }
          for (const delay of delays) {
            if (!TIME.test(delay) || ZERO.test(delay)) continue;
            offenders.push(`${path}: ${prop}: ${value}`);
          }
        }
      }
    }

    expect(
      offenders,
      'a literal delay outlives the 1ms clamp - reach for --stagger-step or a --dur-* token'
    ).toEqual([]);
  });
});


/* Phase 10 redesign ticket 25: every change of state moves (DIRECTION.md
   rule 10, ADR-0078). The movements this ticket adds to surfaces that
   already existed, held at the level a stylesheet can be held to: that each
   exists, that each spends only transform, opacity or clip-path (nothing
   that repaints a whole region per frame), and that each clamps. */
describe('ticket 25: every state change moves', () => {
  const kit = stripComments(readFileSync(join(root, 'src/lib/styles/kit.css'), 'utf8'));
  const components = stripComments(readFileSync(join(root, 'src/lib/styles/components.css'), 'utf8'));
  const app = stripComments(readFileSync(join(root, 'src/lib/styles/app.css'), 'utf8'));
  const keyframesOf = (css: string, name: string) =>
    rules(css).find((rule) => rule.prelude === `@keyframes ${name}`);
  const ruleOf = (css: string, prelude: string) =>
    rules(css).find((rule) => rule.prelude === prelude && !isReduceContext(rule));

  /* The two keyframes this ticket writes. clip-path is the one property
     beside transform and opacity the performance contract admits, because a
     block that clips open moves like an object and a block that fades in
     arrives from nothing. */
  const NEW_KEYFRAMES = ['kit-block-in', 'kit-rule-in'];
  const ALLOWED = new Set(['clip-path', 'transform', 'opacity']);

  it('animates only clip-path, transform or opacity in every keyframe it adds', () => {
    for (const name of NEW_KEYFRAMES) {
      const block = keyframesOf(kit, name);
      expect(block, `@keyframes ${name} exists`).toBeDefined();
      for (const frame of frames(block!.body)) {
        for (const prop of Object.keys(frame.decls)) {
          expect(ALLOWED.has(prop), `${name} ${frame.stops} animates ${prop}`).toBe(true);
        }
      }
    }
  });

  it('clips a tile block open from its left edge on --dur-slow, filling both ways so the clamp cannot strand it', () => {
    const tile = declarations(ruleOf(kit, '.kit-tile')?.body ?? '');
    expect(tile.animation).toMatch(/^kit-block-in var\(--dur-slow\) var\(--ease-out\) both$/);
    const block = frames(keyframesOf(kit, 'kit-block-in')!.body);
    expect(block[0].decls['clip-path']).toMatch(/inset\(-\d+px 100% -\d+px -\d+px/);
    expect(block.at(-1)!.decls['clip-path']).toMatch(/^inset\(-\d+px/);
  });

  it('staggers the tiles of one grid by --stagger-step, in order', () => {
    expect(ruleOf(kit, '.kit-tile')?.body).toMatch(/animation-delay:\s*calc\(var\(--tile-index, 0\) \* var\(--stagger-step\)\)/);
    for (let n = 2; n <= 6; n++) {
      expect(ruleOf(kit, `.kit-tiles > :nth-child(${n})`)?.body, `tile ${n}`).toMatch(
        new RegExp(`--tile-index:\\s*${n - 1}`)
      );
    }
    /* A seventh tile takes the last slot, not the first: uncapped, it fell
       back to --tile-index 0 and arrived in lockstep with the first tile. */
    expect(ruleOf(kit, '.kit-tiles > :nth-child(n + 7)')?.body).toMatch(/--tile-index:\s*6/);
  });

  /* The chosen label whitens on an ease-in while the pill arrives on an
     ease-out, so the label is still ink-dark while most of the pill is
     still travelling and turns page-coloured only as the ink covers it. On
     one curve the two crossed mid-way: "365d" lost its "d" for two frames,
     a light letter on a light track where the pill had not yet reached
     (impeccable critique, segment-rerange frames 6 and 7). The leaving
     label keeps the ease-out, so it darkens as fast as the pill uncovers
     it. The destination rule owns a transition's curve, which is why the
     active state can carry a different one from the base. */
  it('whitens the chosen label late, on an ease-in, while the leaving label darkens early', () => {
    const active = declarations(ruleOf(components, '.segment.is-active')?.body ?? '');
    const curves = splitTopLevel(active['transition-timing-function'] ?? '');
    expect(curves[0]).toBe('var(--ease-out)');
    expect(curves[1]).toMatch(/^cubic-bezier\(0\.\d+, 0, 0\.\d+, 0\)$/);
    const base = declarations(ruleOf(components, '.segment')?.body ?? '');
    expect(base['transition-timing-function']).toBe('var(--ease-out), var(--ease-out)');
  });

  it("draws a section's rule in ahead of its words: the heading clips, its children clip later", () => {
    const heading = declarations(ruleOf(kit, '.kit-heading')?.body ?? '');
    expect(heading.animation).toMatch(/^kit-rule-in var\(--dur-slow\) var\(--ease-out\) both$/);
    const words = declarations(ruleOf(kit, '.kit-heading > *')?.body ?? '');
    expect(words.animation).toMatch(/^kit-rule-in var\(--dur-slow\) var\(--ease-out\) both$/);
    expect(words['animation-delay'], 'the words wait for the rule').toMatch(/var\(--dur-fast\)/);
  });

  /* The chosen label's colour lands on the frame the pill does. It used to
     run on --dur-fast against a pill on --dur-med, so a label turned page-
     coloured 90ms before the ink arrived under it and sat unreadable on the
     track. */
  it("lands the segment label's colour on the same frame as the pill", () => {
    const segment = declarations(ruleOf(components, '.segment')?.body ?? '');
    const pill = declarations(ruleOf(components, '.segment-pill')?.body ?? '');
    /* The pill's leading edge (redesign ticket 26: `left` on the near
       schedule, whose fallback is --dur-med) is what lands the choice; the
       label's colour lands with that edge. */
    const leading = splitTopLevel(pill.transition ?? '').find((part) => words(part)[0] === 'left') ?? '';
    const pillDuration = /var\(--seg-near-dur, (var\(--dur-[a-z]+\))\)/.exec(leading)?.[1];
    expect(pillDuration).toBeDefined();
    for (const duration of splitTopLevel(segment['transition-duration'] ?? '')) {
      expect(duration).toBe(pillDuration);
    }
  });

});

describe('ticket 28: the field is a blind over the content', () => {
  const app = stripComments(readFileSync(join(root, 'src/lib/styles/app.css'), 'utf8'));
  const tokens = stripComments(readFileSync(join(root, 'src/lib/theme/base.css'), 'utf8'));
  const keyframesOf = (css: string, name: string) =>
    rules(css).find((rule) => rule.prelude === `@keyframes ${name}`);
  const ruleOf = (css: string, prelude: string) =>
    rules(css).find((rule) => rule.prelude === prelude && !isReduceContext(rule));

  /* The field is a blind over the content (ticket 28). Ticket 25's shared
     name is gone: the card is split into a flat block that carries one name
     across every screen and the elements painted on it, each named per side
     so nothing can pair with anything and nothing morphs.

     The names are handed over by script ($lib/motion/fieldBlind), never
     written as a rule: a rule names the outgoing and the incoming blind at
     once at the new capture, and the browser aborts the transition. So what
     the stylesheet is held to is that it names nothing, and the shell to
     carrying the blind on every navigation rather than on the tab crossing
     alone. */
  it('names the blind and everything painted on the field by hand-over, never by rule', () => {
    for (const { path, css } of styleSources()) {
      for (const rule of rules(css)) {
        expect(rule.body, `${path}: ${rule.prelude} names a shared element`).not.toMatch(
          /view-transition-name:\s*(blind|field|fp-|sun-)/
        );
      }
    }
    const layout = readFileSync(join(root, 'src/routes/+layout.svelte'), 'utf8');
    expect(layout).toContain("import { carryBlind } from '$lib/motion/fieldBlind'");
    expect(layout, 'every navigation, not the tab crossing alone').toContain(
      'const blind = carryBlind();'
    );
    expect(layout).toContain('blind.swap()');
    expect(layout).toContain('blind.release()');
  });

  /* The bottom corners stay exact on every frame of the slide, which is
     what the clip buys: the block itself is never resized, so there is no
     frame in which a 175px snapshot is being squashed into 102. The group
     is pinned for the same reason - a tween of the box is a scale of the
     picture inside it. */
  it('slides the blind on one clip, at one size, with its corners in the clip', () => {
    expect(declarations(ruleOf(app, '::view-transition-group(blind)')?.body ?? '').animation).toBe(
      'none'
    );
    const halves = declarations(
      ruleOf(app, '::view-transition-old(blind),\n::view-transition-new(blind)')?.body ?? ''
    );
    expect(halves.animation).toBe(
      'blind-slide var(--dur-slow) var(--blind-ease, var(--ease-out)) both'
    );
    const slide = frames(keyframesOf(app, 'blind-slide')!.body);
    expect(slide.length, 'one curve from one height to another, not a phase list').toBe(2);
    for (const frame of slide) {
      expect(Object.keys(frame.decls), `${frame.stops} moves something else`).toEqual(['clip-path']);
      expect(frame.decls['clip-path']).toMatch(/round 0 0 var\(--r-block\) var\(--r-block\)\)$/);
    }
    expect(slide[0].decls['clip-path']).toContain('var(--blind-from');
    expect(slide[1].decls['clip-path']).toContain('var(--blind-to');
  });

  /* No frame carries two of the field's contents: the outgoing element
     spends --dur-fast, the incoming one waits exactly that long before it
     starts, and both travel 12-16px rather than sliding between two
     screens' positions. */
  it('fades one of the field\'s contents out before the next fades in, each with its own travel', () => {
    const out = declarations(ruleOf(app, '::view-transition-old(*.field-part)')?.body ?? '');
    const fresh = declarations(ruleOf(app, '::view-transition-new(*.field-part)')?.body ?? '');
    expect(out.animation).toContain('field-part-out var(--dur-fast) var(--ease-in-out) both');
    expect(fresh.animation, 'the incoming one waits for the outgoing one').toContain(
      'field-part-in var(--dur-fast) var(--ease-out) var(--dur-fast) both'
    );
    for (const name of ['field-part-out', 'field-part-in']) {
      const [frame] = frames(keyframesOf(app, name)!.body);
      expect(Object.keys(frame.decls).sort()).toEqual(['opacity', 'transform']);
      /* The direction is the blind's, published per navigation, so the two
         travel the way the edge is going rather than always downwards. */
      expect(frame.decls.transform).toContain('var(--part-travel');
      expect(frame.decls.transform, `${name} goes the right way`).toMatch(
        name.endsWith('-in') ? /calc\(-1 \* var/ : /translateY\(var/
      );
    }
  });

  /* What is painted on the field is printed on it: both sides ride the
     blind's own curve, so a mark keeps its distance from the edge and
     cannot be left hanging outside the field (Alicja, round one). The ride
     is `translate` and the leave is `transform`, which is what lets the two
     animations sit on one element without overwriting each other. */
  it('rides everything painted on the field with the blind, on the blind\'s own curve', () => {
    const ride = 'var(--dur-slow) var(--blind-ease, var(--ease-out)) both';
    for (const [selector, keyframe] of [
      ['::view-transition-old(*.field-part)', 'blind-lead'],
      ['::view-transition-new(*.field-part)', 'blind-follow'],
      ['::view-transition-old(*.sun-ring)', 'blind-lead'],
      ['::view-transition-new(*.sun-ring)', 'blind-follow']
    ]) {
      expect(declarations(ruleOf(app, selector)?.body ?? '').animation, selector).toContain(
        `${keyframe} ${ride}`
      );
    }
    for (const name of ['blind-lead', 'blind-follow']) {
      for (const frame of frames(keyframesOf(app, name)!.body)) {
        expect(Object.keys(frame.decls), `${name} ${frame.stops}`).toEqual(['translate']);
      }
    }
    /* The ride ends where the element rests, both ways round. */
    expect(frames(keyframesOf(app, 'blind-follow')!.body).at(-1)!.decls.translate).toBe('0 0');
    expect(frames(keyframesOf(app, 'blind-lead')!.body)[0].decls.translate).toBe('0 0');
  });

  /* The content under the blind travels with its bottom edge, on the
     blind's clock and on a plain ease-out of its own - the blind is painted
     over the page and covers the difference between the two curves, and a
     page that bounced with the edge would rock the whole screen at the end
     of every navigation. Transform only, and the delta is measured at
     navigation time rather than written per screen. */
  it("follows the blind's edge with the incoming screen, on the blind's clock", () => {
    const incoming = declarations(ruleOf(app, '::view-transition-new(screen)')?.body ?? '');
    expect(incoming['animation-duration']).toBe('var(--dur-med), var(--dur-slow)');
    expect(incoming['animation-timing-function']).toBe('var(--ease-out)');
    const follow = frames(keyframesOf(app, 'blind-follow')!.body);
    for (const frame of follow) {
      expect(Object.keys(frame.decls), `${frame.stops} moves something else`).toEqual(['translate']);
    }
    expect(follow[0].decls.translate).toBe('0 var(--blind-delta, 0px)');
    expect(follow.at(-1)!.decls.translate, 'ends where the screen rests').toBe('0 0');
    /* Every pattern the app navigates with, not the tab crossing alone. */
    for (const pattern of ['fade-through', 'shared-axis', 'shared-axis-back', 'container']) {
      const rule = ruleOf(app, `html[data-nav='${pattern}']::view-transition-new(screen)`);
      expect(declarations(rule?.body ?? '')['animation-name'], pattern).toMatch(
        /, blind-follow$/
      );
    }
  });

  /* The sun leaves as a movement: one group per ring, closing outermost
     first on a beat of its own, and the whole run inside the door's clock.
     A delay per ring is a rule per ring, so the arithmetic is checked
     against the longest flag rather than assumed - a ninth stripe added to
     a palette with no eighth rule here would silently close on the beat of
     the first. */
  it('closes the sun outermost first, and every ring inside --dur-slow', () => {
    const closes = declarations(ruleOf(app, '::view-transition-old(*.sun-ring)')?.body ?? '');
    const opens = declarations(ruleOf(app, '::view-transition-new(*.sun-ring)')?.body ?? '');
    expect(closes.animation).toContain('sun-ring-close var(--dur-fast) var(--ease-in-out) both');
    expect(opens.animation).toContain('sun-ring-open var(--dur-fast) var(--ease-out) both');
    for (const name of ['sun-ring-close', 'sun-ring-open']) {
      for (const frame of frames(keyframesOf(app, name)!.body)) {
        expect(Object.keys(frame.decls), `${name} ${frame.stops}`).toEqual(['scale']);
      }
    }

    const steps: number[] = [];
    for (const rule of rules(app)) {
      const ring = /view-transition-old\(sun-a-(\d+)\)/.exec(rule.prelude);
      if (!ring) continue;
      expect(rule.prelude, 'both sides on one beat').toContain(
        `::view-transition-new(sun-b-${ring[1]})`
      );
      const delay = declarations(rule.body)['animation-delay'];
      /* The beat is the ring's own; the ride beside it starts with the
         blind, so the list has a second value rather than one for both. */
      expect(delay, `ring ${ring[1]}`).toMatch(
        new RegExp(`^calc\\(${ring[1]} \\* var\\(--stagger-ring\\)\\), 0s$`)
      );
      steps.push(Number(ring[1]));
    }
    expect(steps, 'one rule per ring, in order').toEqual([...steps].sort((a, b) => a - b));

    const palettes = readFileSync(join(root, 'src/lib/theme/palettes.css'), 'utf8');
    const longest = Math.max(
      ...[...palettes.matchAll(/--motif-stripes:\s*([^;]+);/g)].map(
        (match) => match[1].split(',').length
      )
    );
    expect(steps.length, 'a flag with more stripes than there are beats').toBe(longest);

    /* --stagger-ring 30ms, --dur-fast 150ms, --dur-slow 380ms: the last
       ring starts at 180 and lands at 330. */
    const ms = (token: string) =>
      Number(/(\d+)ms/.exec(new RegExp(`${token}:\\s*([^;]+);`).exec(tokens)?.[1] ?? '')?.[1]);
    const lands = (longest - 1) * ms('--stagger-ring') + ms('--dur-fast');
    expect(lands, 'the innermost ring lands inside the door change').toBeLessThanOrEqual(
      ms('--dur-slow')
    );
  });

  /* Substitute, never delete. The blind cuts, because --dur-slow is clamped
     at the token and a box arriving at its new height instantly is the
     substitute for one sliding to it; the contents keep the screens' own
     out-then-in crossfade over --dur-crossfade, which the clamp deliberately
     does not reach; and the sun cuts with its stagger taken to zero. */
  it('cuts the blind and the sun and crossfades the field\'s contents under both reduced-motion paths', () => {
    const halves = declarations(
      ruleOf(app, '::view-transition-old(blind),\n::view-transition-new(blind)')?.body ?? ''
    );
    expect(halves.animation, 'the blind runs on a clamped token').toContain('var(--dur-slow)');
    for (const context of [/html\[data-a11y-motion='reduce'\]/, /prefers-reduced-motion/]) {
      expect(tokens, `--stagger-ring under ${context}`).toMatch(
        new RegExp(`${context.source}[\\s\\S]*?--stagger-ring:\\s*0ms`)
      );
    }

    const reduced = rules(app).filter(isReduceContext);
    const old = reduced.filter((rule) => rule.prelude.includes('view-transition-old(*.field-part)'));
    const fresh = reduced.filter((rule) =>
      rule.prelude.includes('view-transition-new(*.field-part)')
    );
    expect(old.length, 'the outgoing contents, both paths').toBe(2);
    expect(fresh.length, 'the incoming contents, both paths').toBe(2);
    for (const rule of old) {
      const d = declarations(rule.body);
      expect(d['animation-name']).toBe('screen-fade-away');
      expect(d['animation-duration']).toBe('var(--dur-crossfade) !important');
    }
    for (const rule of fresh) {
      const d = declarations(rule.body);
      expect(d['animation-name']).toBe('screen-crossfade');
      expect(d['animation-delay'], 'the incoming half waits for the outgoing one').toBe(
        'var(--dur-crossfade)'
      );
      expect(d['animation-fill-mode'], 'held at its first frame through the wait').toBe('both');
    }
  });
});

describe('the cap on animating layout', () => {
  /* materials.css's contract says only transform and opacity animate,
     because the target is a Capacitor WebView on a mid-range Android phone.
     Phase 5 ticket 28 amended it for three materials and redesign ticket 26
     for one more - the travelling highlight's two edges, which cannot be
     said with a transform at all, since a translate moves both edges
     together and the width between them is the live difference of two
     curves rather than a value with a curve of its own.

     Enumerated here rather than prohibited, so the next one is argued
     instead of added. Every entry names the selector, the properties and
     why; anything else animating a layout property fails.

     Writing this check is how it came out that the contract was already
     not being kept. Six rules were animating a layout property before this
     ticket touched anything, `.segment-pill`'s own `width` among them -
     which is the other travelling indicator, doing this ticket's job by
     the same class of means. They are listed below as INHERITED, and the
     distinction between the two lists is exactly what each one is worth:
     an EXEMPT entry has an argument and a measurement behind it, an
     INHERITED entry has only the fact that it is already shipped. Nobody
     has benchmarked the second list; this check found it and does not
     bless it. */
  const LAYOUT_EXEMPT: { selector: string; props: string[]; reason: string }[] = [
    {
      selector: "[data-nav-pill='bar']",
      props: ['left', 'right'],
      reason:
        'one absolutely positioned empty box per nav, so its insets invalidate its own layout and nothing else; tests/nav-motion-cost.mjs holds the frame cadence at 4x CPU throttling'
    },
    {
      selector: "[data-nav-pill='rail']",
      props: ['top', 'bottom'],
      reason: "the same box on the rail's axis, for the same reason (redesign ticket 26)"
    },
    {
      selector: '.segment-pill',
      props: ['left', 'right'],
      reason:
        "the switcher's pill on the navigation's own mechanic (2026-09-08), one absolutely positioned empty box out of the track's flow, so its insets cannot move a segment; it animated `width` before, which was the same class of expense with none of the argument"
    },
    {
      selector: '.skip-link',
      props: ['top'],
      reason:
        'the skip link is off-screen until focused and is the only thing in its own stacking context; it predates the contract and moves once per keyboard session'
    }
  ];

  /** Already shipping when this check was written, unaudited. Each one is a
      candidate for a carpet ticket rather than a decision anyone made
      against the contract. Moving an entry up to LAYOUT_EXEMPT means
      arguing the bound and measuring it; deleting one means the rule
      stopped animating layout. */
  const LAYOUT_INHERITED: { selector: string; props: string[]; note: string }[] = [
    { selector: '.kit-bar-mark', props: ['width'], note: 'the inline bar in a tile' },
    { selector: '.kit-dist-mark', props: ['height'], note: 'a distribution column' },
    { selector: '.kit-ordered-seg', props: ['width'], note: "OrderedStrip's segments" },
    { selector: '.kit-ordered-share', props: ['width'], note: "OrderedStrip's share bar" }
    /* `.setup-reveal` was here, onboarding's one grid-template animation: the
       fold under the check-in switch that opened to show a time field. The
       check-in step left setup with phase 10 redesign ticket 31 and took the
       fold with it, so the app has no grid-template animation left. */
  ];

  const LAYOUT = [
    'width',
    'height',
    'top',
    'right',
    'bottom',
    'left',
    'inset',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding',
    'gap',
    'flex-basis',
    'grid-template-columns',
    'grid-template-rows'
  ];

  it('animates a layout property only where this file enumerates it', () => {
    const allowed = new Map(
      [...LAYOUT_EXEMPT, ...LAYOUT_INHERITED].map((entry) => [entry.selector, entry.props])
    );
    const offenders: string[] = [];

    for (const { path, css } of styleSources()) {
      for (const rule of rules(css)) {
        if (rule.prelude.startsWith('@')) continue;
        const decls = declarations(rule.body);
        const named = new Set<string>();
        for (const part of splitTopLevel(decls.transition ?? '')) {
          const property = words(part)[0];
          if (property) named.add(property);
        }
        for (const property of splitTopLevel(decls['transition-property'] ?? '')) {
          named.add(property.trim());
        }
        for (const property of named) {
          if (!LAYOUT.includes(property) && property !== 'all') continue;
          const selectors = rule.prelude.split(',').map((s) => s.trim());
          if (selectors.every((selector) => allowed.get(selector)?.includes(property))) continue;
          offenders.push(`${path}: ${rule.prelude} transitions ${property}`);
        }
      }
    }

    expect(
      offenders,
      'reaching past transform and opacity needs an entry in LAYOUT_EXEMPT with a bounded-layout reason and a benchmark'
    ).toEqual([]);
  });

  /* Both lists are cross-checked against the sheets, so an entry that stops
     being true fails instead of sitting here forever - which is the only
     thing that keeps the inherited list shrinking rather than growing. */
  it('lists nothing that has stopped animating its layout property', () => {
    const found = new Set<string>();
    for (const { css } of styleSources()) {
      for (const rule of rules(css)) {
        if (rule.prelude.startsWith('@')) continue;
        const decls = declarations(rule.body);
        const named = [
          ...splitTopLevel(decls.transition ?? '').map((part) => words(part)[0]),
          ...splitTopLevel(decls['transition-property'] ?? '').map((part) => part.trim())
        ];
        for (const selector of rule.prelude.split(',').map((s) => s.trim())) {
          for (const property of named) if (property) found.add(`${selector} ${property}`);
        }
      }
    }
    const stale: string[] = [];
    for (const entry of [...LAYOUT_EXEMPT, ...LAYOUT_INHERITED]) {
      for (const property of entry.props) {
        if (!found.has(`${entry.selector} ${property}`)) stale.push(`${entry.selector} ${property}`);
      }
    }
    expect(stale, 'an entry here no longer animates what it claims - delete it').toEqual([]);
  });

  it('gives every exemption a reason, so the list cannot grow silently', () => {
    for (const entry of LAYOUT_EXEMPT) {
      expect(entry.props.length, `${entry.selector} exempts nothing`).toBeGreaterThan(0);
      expect(entry.reason.length, `${entry.selector} has no reason`).toBeGreaterThan(40);
    }
  });
});

/* Both travelling indicators - the navigation's pill and the switcher's -
   run one mechanic out of $lib/motion/indicator.ts, which owns the
   arithmetic and the two clocks an edge can be on. The component writes a
   clock per edge into custom properties; the stylesheet carries a fallback
   for the case where nothing has been written yet, which is a pill that has
   not travelled.

   Those two say the same thing in two places, and nothing but this makes
   them agree. Change LEAD's duration in the module and every fallback in
   the sheets still names the old token: a pill that has never moved would
   then be on one duration and a pill that has on another, and the check
   ticket 25 wrote against the switcher's leading edge - the label's colour
   has to land on the frame the pill does - would keep passing while the
   label drifted off it by the difference. */
describe("the travelling indicators' shared mechanic", () => {
  const source = readFileSync(join(root, 'src/lib/motion/indicator.ts'), 'utf8');

  /** One schedule as indicator.ts declares it, read out of the source rather
      than imported: the node tier has no `$lib` alias, and this file already
      reads every other contract it holds off the text. */
  function scheduleIn(name: string) {
    const at = source.indexOf(`export const ${name}: Schedule = {`);
    const block = at < 0 ? '' : source.slice(at, source.indexOf('}', at));
    /* indexOf and one literal regex rather than a RegExp built from a
       template: `\s` inside a template literal is not an escape, it is the
       letter s, so a pattern assembled that way silently matches nothing. */
    const field = (key: string) => {
      const from = block.indexOf(`${key}:`);
      return from < 0 ? undefined : /'([^']*)'/.exec(block.slice(from))?.[1];
    };
    return { dur: field('dur'), ease: field('ease'), delay: field('delay') };
  }

  /** The fallback inside `var(--written-by-the-component, THIS)`. */
  const fallbackOf = (word: string) => /^var\(\s*--[\w-]+\s*,\s*([\s\S]+)\)$/.exec(word)?.[1]?.trim();

  const PILLS: { sheet: string; prelude: string; props: string[] }[] = [
    { sheet: 'src/lib/styles/app.css', prelude: "[data-nav-pill='bar']", props: ['left', 'right'] },
    { sheet: 'src/lib/styles/app.css', prelude: "[data-nav-pill='rail']", props: ['top', 'bottom'] },
    { sheet: 'src/lib/styles/components.css', prelude: '.segment-pill', props: ['left', 'right'] }
  ];

  it('declares a LEAD whose three parts are all readable', () => {
    const lead = scheduleIn('LEAD');
    expect(lead.dur, 'LEAD.dur - has indicator.ts been reshaped?').toBeDefined();
    expect(lead.ease).toBeDefined();
    expect(lead.delay).toBeDefined();
  });

  it('falls back to exactly the schedule an untravelled pill is written with', () => {
    const lead = scheduleIn('LEAD');
    const mismatches: string[] = [];

    for (const pill of PILLS) {
      const css = stripComments(readFileSync(join(root, pill.sheet), 'utf8'));
      const rule = rules(css).find((r) => r.prelude === pill.prelude && !isReduceContext(r));
      expect(rule, `${pill.prelude} is gone from ${pill.sheet}`).toBeDefined();
      const parts = splitTopLevel(declarations(rule!.body).transition ?? '');

      for (const prop of pill.props) {
        const part = parts.find((candidate) => words(candidate)[0] === prop);
        expect(part, `${pill.prelude} no longer transitions ${prop}`).toBeDefined();
        const [, dur, ease, delay] = words(part!);
        const found = { dur: fallbackOf(dur), ease: fallbackOf(ease), delay: fallbackOf(delay) };
        for (const key of ['dur', 'ease', 'delay'] as const) {
          if (found[key] !== lead[key]) {
            mismatches.push(
              `${pill.prelude} ${prop}: falls back to ${key} ${found[key]} where indicator.ts's LEAD writes ${lead[key]}`
            );
          }
        }
      }
    }

    expect(
      mismatches,
      "a pill that has not travelled would move on a different clock from one the component has placed"
    ).toEqual([]);
  });
});

describe('the curves the tiers reach for', () => {
  /* Phase 5 ticket 29 retired --ease-spring, a cubic-bezier whose control
     points bulged past 1 so a press would overshoot. It never could: a
     cubic-bezier approaches its end from one side however far its handles
     reach, so all the bulge bought was a curve that arrived fast and hard.
     --ease-press, a linear() sampled off a real spring, is what actually
     overshoots and settles, and everything that was never a press wanted a
     plain deceleration all along.

     Held here because the taste rule behind it - real objects decelerate,
     bounce and elastic read as dated - is not something a curve can be
     argued back into one rule at a time. The bounds match Impeccable's
     mechanical detector so the two agree on what counts. */
  it('bounces nowhere: no cubic-bezier control point leaves its own range', () => {
    const offenders: string[] = [];
    for (const { path, css } of styleSources()) {
      for (const match of css.matchAll(
        /cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/g
      )) {
        const [y1, y2] = [parseFloat(match[2]), parseFloat(match[4])];
        if (y1 < -0.1 || y1 > 1.1 || y2 < -0.1 || y2 > 1.1) offenders.push(`${path}: ${match[0]}`);
      }
    }

    expect(offenders, 'an overshoot belongs to --ease-press, which samples a spring properly').toEqual([]);
  });

  it('names no bounce, elastic or spring easing in an animation', () => {
    const offenders: string[] = [];
    for (const { path, css } of styleSources()) {
      for (const match of css.matchAll(/animation(?:-name)?\s*:\s*([^;{}]+)/g)) {
        if (/bounce|elastic|wobble|jiggle|spring/i.test(match[1])) offenders.push(`${path}: ${match[0].trim()}`);
      }
    }

    expect(offenders, 'a keyframe that needs an overshoot writes the overshoot into its frames').toEqual([]);
  });
});
