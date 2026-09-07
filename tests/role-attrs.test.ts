/* roleAttrs() and the derivation it opts a surface into (phase 5 ticket
   32.8). A surface that calls the helper but never gets added to a list
   somewhere else was the whole bug - ticket 23's /timeline drew invisible
   dots and rail because .timeline was missing from a hand-maintained
   selector in kit.css, and nothing here would have caught it: the CSS was
   valid, the tokens were spelled correctly, and the only symptom was that
   nothing drew. What's worth holding to a test is that opting in is one
   call now, and that kit.css has nothing left to hand-maintain.

   Half calls and half greps, on purpose (ticket 08): roleAttrs is a
   function and is called, while "kit.css has nothing left to
   hand-maintain" is a negative over a stylesheet and can only be
   matched. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roleAttrs } from '../src/lib/components/kit/role';
import type { Role } from '../src/lib/theme/roles';

// roleAttrs() reads stripe, ink, mark and the ramp's deepest step; `paired`
// is here to satisfy the type, and is handed straight to whichever component
// draws a mark beside another one rather than through these attributes. The
// ramp is agender's yellow through a light card, shortened to the two ends
// that matter here: the fill nobody writes on, and the stripe somebody does.
const role: Role = {
  stripe: '#FCF434',
  ink: '#665f00',
  mark: '#8f8500',
  paired: '#FCF434',
  heat: [
    { fill: '#FFFFFF', ink: '#131019' },
    { fill: '#FCF434', ink: '#131019' }
  ]
};

describe('roleAttrs', () => {
  it('sets the four inputs a role needs, given one', () => {
    const attrs = roleAttrs(role);
    expect(attrs.style).toBe(
      '--role: #FCF434; --role-ink-in: #665f00; --role-mark-in: #8f8500; --role-fill-ink-in: #131019'
    );
  });

  /* The ink a label on a fill takes is the ramp's, not the role's own
     (phase 9 UX carpet ticket 11). --role-ink-in is proven against the
     surfaces and the two tints a role paints, and never against the stripe
     itself: measured across all eight palettes, both themes and every
     stripe, 59 of the 66 roles put their own ink below 4.5:1 on their own
     stripe, and on trans/dark the ink for the blue band is the blue band -
     1:1, a label nobody can see at all. The ramp's deepest step is #000000
     there, at 11.65:1. */
  it('takes the label-on-a-fill ink from the ramp\'s deepest step, not from the role ink', () => {
    const style = roleAttrs(role).style!;
    expect(style).toContain(`--role-fill-ink-in: ${role.heat[role.heat.length - 1].ink}`);
    expect(style).not.toContain(`--role-fill-ink-in: ${role.ink}`);
  });

  it('carries data-kit-role even with no role, so the accent fallback still runs', () => {
    // kit.css's derivation rule matches [data-kit-role] unconditionally and
    // falls back to --accent when --role is unset - a surface that skipped
    // the attribute here would skip that fallback too, and go back to
    // painting nothing rather than the accent an uncoloured area gets.
    const attrs = roleAttrs(undefined);
    expect(attrs['data-kit-role']).toBe('');
    expect(attrs.style).toBeUndefined();
  });

  it('always carries data-kit-role, given a role too', () => {
    expect(roleAttrs(role)['data-kit-role']).toBe('');
  });
});

describe("kit.css's role derivation", () => {
  const kit = readFileSync('src/lib/styles/kit.css', 'utf8');

  it('is selected by [data-kit-role], not a hand-maintained list of surface classes', () => {
    // The regression this guards: a selector like `.kit-row, .kit-day, ...`
    // silently strands the next surface that calls roleAttrs() but isn't
    // added to the list - it gets the raw inputs and none of the derived
    // values. [data-kit-role] is set by the same call that sets the inputs, so
    // there is nothing left to remember in a second file.
    const rule = /\[data-kit-role\]\s*\{[\s\S]*?--role-hairline:/.exec(kit);
    expect(rule, 'kit.css should derive --role-mark/--role-ink/etc. from [data-kit-role]').not.toBeNull();
  });

  it('names no surface class in its own selector', () => {
    expect(kit).toMatch(/\n\[data-kit-role\]\s*\{\n\s*--role-c:/);
    // The trap this replaced: a class the next surface had to remember to
    // join, silently, in a different file from the one that set --role.
    expect(kit).not.toMatch(/\.kit-row,\s*\n\.kit-day,/);
  });
});
