/* The rules the chromeless screens keep after the rebuild (phase 5 ticket
   26), at the level their source can be held to.

   What makes them right is mostly proportion and copy, which an eye and the
   walkthrough settle between them. What is left is mechanical, and every
   one of these is something a later ticket could quietly put back: a sixth
   copy of the gate frame, a shadow on a screen the redesign gave no
   shadows, a journal read on a screen that renders before the journal is
   open, or the flag showing on a screen someone reached while disguised.

   All of those are greps because all of them are negatives: a screen may
   not draw this, may not import that. There is nothing to call. The one
   rule these screens do state - which steps onboarding offers - is
   asserted by calling onboardingSteps, which is the shape ticket 08 asks
   every rule to take. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { onboardingSteps } from '../src/lib/onboarding/steps';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const stripScript = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');
/** The step-count checks below are about script logic - a `--space-7` in
    the first run's own <style> block (phase 5 audit ticket 16) is a
    spacing token, not a hardcoded step count, and \b7\b cannot tell the
    difference from the name alone. */
const stripStyle = (source: string) => source.replace(/<style[\s\S]*?<\/style>/g, '');
/** Block comments out, so a rule against a shape can be written down in a
    comment next to the code that replaced it without failing itself. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
/** One rule's declarations, by exact selector. Enough for a sheet written
    one selector per rule, which these are; direction-contract.test.ts has
    the general parser for the checks that need one. */
function ruleBody(css: string, prelude: string): string {
  const at = css.indexOf(`\n${prelude} {`);
  if (at === -1) return '';
  return css.slice(at, css.indexOf('\n}', at));
}

/* Ticket 53 split LockScreen and PassphraseGate into three: the boot gate,
   the mid-session one, and the setup module the first of them renders. The
   module is not in this list because it is not a gate - it draws inside one,
   and its frame is whichever gate or settings card mounted it. */
const GATES = [
  'src/lib/components/SessionUnlock.svelte',
  'src/lib/components/JournalGate.svelte',
  'src/lib/components/AndroidKeyGate.svelte',
  'src/lib/components/DeviceBoundRecovery.svelte',
  'src/lib/components/SchemaTooNew.svelte'
];

/** Held to the gates' content rules but not to their frame rule, for the
    reason above. */
const GATE_CONTENT = [...GATES, 'src/lib/components/AccessModeSetup.svelte', 'src/lib/components/PinPad.svelte'];

const onboarding = read('src/routes/onboarding/+page.svelte');
const onboardingMarkup = stripScript(onboarding);

describe('the gates are one object, not six copies of one', () => {
  it('builds every gate from the shared shell', () => {
    for (const path of GATES) {
      expect(read(path), path).toMatch(/import GateScreen(?:, \{[^}]*\})? from '\.\/GateScreen\.svelte'/);
      expect(stripScript(read(path)), path).toContain('<GateScreen');
    }
  });

  it('leaves no gate writing the old frame by hand', () => {
    /* .applock and .ob-title were the frame before the shell existed, and
       the six copies had already drifted - two badge sizes, three separate
       inline text-align rules. Both classes are gone from the stylesheet, so
       a gate reaching for either is a gate that has quietly stopped being
       centred. */
    for (const path of [...GATES, 'src/lib/components/GateScreen.svelte']) {
      const markup = stripScript(read(path));
      expect(markup, path).not.toContain('applock-badge');
      expect(markup, path).not.toContain('class="applock"');
      expect(markup, path).not.toContain('ob-title');
    }
    const screens = stripComments(read('src/lib/styles/screens.css'));
    expect(screens).not.toContain('.applock');
    expect(screens).not.toContain('.ob-title');
  });

  it('keeps the classes the screens outside this ticket still use', () => {
    /* .ob-text, .ob-dot and .ob-actions belong to recap and two settings
       screens, which ticket 25 owns. Deleting them with the rest of the
       onboarding vocabulary is the tempting mistake here. */
    const screens = read('src/lib/styles/screens.css');
    for (const kept of ['.ob-text', '.ob-dot', '.ob-actions', '.recap-progress']) {
      expect(screens, kept).toContain(kept);
    }
  });
});

describe('what a gate may show', () => {
  it('reads no journal, on any of them', () => {
    /* These render before the database can be opened, or instead of the app
       while it is locked. A query here is not slow, it is impossible. */
    for (const path of GATES) {
      expect(read(path), path).not.toContain('$lib/data/live/journal');
    }
  });

  it('draws no flag and never names the app except through the wordmark', () => {
    /* No gate carries the sun or reads the stripes: the sun is Home's and
       setup's (ADR-0035), and a single colour is not a flag, so the field a
       gate wears since redesign ticket 34 is the flag's second colour and
       nothing more - `--field` and `--field-ink`, published on <html> by
       activeFlag, which answers disguise itself.

       The app's name is the half that changed. Rule 15 makes it the title of
       every gate that cannot greet by name, so "names the app nowhere" is no
       longer the rule; the rule is that it may only be named through
       `appWordmark`, which is what turns it into the decoy's name under
       disguise. A raw `m.app_name()` on a lock screen shows the real name to
       exactly the person the disguise exists for. */
    for (const path of GATES) {
      /* Comments out first, so this rule can be argued for in prose beside
         the code that keeps it without failing itself. */
      const source = stripComments(read(path));
      expect(source, path).not.toContain('FlagSun');
      expect(source, path).not.toContain('activeFlag');
      for (const at of [...source.matchAll(/m\.app_name\(\)/g)]) {
        const call = source.slice(Math.max(0, at.index - 60), at.index);
        expect(call, `${path}: m.app_name() outside appWordmark()`).toMatch(
          /appWordmark\([^()]*$/
        );
      }
    }
  });

  it('draws one pad, in setup and at every gate', () => {
    /* Redesign ticket 34's own acceptance: "the pad is one component and one
       drawing across setup and the gates". It was already one component -
       ticket 53 extracted it when the PIN got three jobs - and the thing that
       could quietly stop being true is the drawing: a second `.pin-key` or
       `.pin-dot` rule in a screen's own block, or a mount that reaches for
       something other than PinPad. Both are greps because both are
       negatives. */
    const mounts = ['src/lib/components/PinEntry.svelte', 'src/lib/components/AccessModeSetup.svelte'];
    for (const path of mounts) {
      expect(read(path), path).toContain("import PinPad from './PinPad.svelte'");
      expect(stripScript(read(path)), path).toContain('<PinPad');
    }
    /* Nowhere else may draw one. The keypad markup lives in PinPad and the
       two screens above mount it; a third copy is what this catches. */
    const drawn = [...GATE_CONTENT, 'src/routes/onboarding/+page.svelte'].filter((path) =>
      stripComments(stripScript(read(path))).includes('class="pin-key"')
    );
    expect(drawn).toEqual(['src/lib/components/PinPad.svelte']);
    /* And one set of rules for it. `components.css` is the always-loaded
       sheet both surfaces read; a `.pin-key` or `.pin-dot` selector in a
       route's own scoped block would be a second drawing that only one of
       them wears. */
    for (const [where, css] of [
      ['screens', read('src/lib/styles/screens.css')],
      ['onboarding', read('src/routes/onboarding/+page.svelte').slice(read('src/routes/onboarding/+page.svelte').indexOf('<style>'))]
    ] as const) {
      expect(stripComments(css), where).not.toMatch(/\.pin-(key|dot|pad)\s*[,{]/);
    }
  });

  it('animates no gate onto the screen, and says why where the shell is', () => {
    /* Rule 15 and ADR-0078's cut list: a cold start has nothing to come from
       and a mid-session lock arriving is the one state change whose whole
       value is being instant. Everything after that first frame moves, which
       is what $lib/motion/appOpening is for - and it only ever runs on the
       change that *ends* a gate.

       Two negatives and one positive. Nothing a gate is built from may bring
       the screen on: not the frame, not the field, and not the mount. The
       title is the exception that proves it - it carries `in:`/`out:`
       because a gate asks more than one thing over its life and that change
       is inside a settled screen, which is the half of rule 15 that says
       everything after the first frame moves. So the rule is written against
       the three elements that are the screen rather than against the file. */
    const shellMarkup = stripComments(stripScript(read('src/lib/components/GateScreen.svelte')));
    for (const frame of ['screen screen-gate', 'gate step-field-host', 'gate-field step-field']) {
      const at = shellMarkup.indexOf(`class="${frame}"`);
      expect(at, `${frame} is not the shell's own element any more`).toBeGreaterThan(-1);
      const tag = shellMarkup.slice(at, shellMarkup.indexOf('>', at));
      expect(tag, `${frame} animates its own arrival`).not.toMatch(/\b(in|transition):[a-zA-Z]/);
    }
    for (const path of GATES) {
      const mount = stripComments(stripScript(read(path)));
      for (const at of [...mount.matchAll(/<GateScreen[^>]*>/g)]) {
        expect(at[0], `${path}: a gate animating its own arrival`).not.toMatch(
          /\b(in|transition):[a-zA-Z]/
        );
      }
    }
    const shell = read('src/lib/components/GateScreen.svelte');
    expect(shell).toMatch(/arrival is a cut on every gate/i);
    /* The one direction that does move, named in the shell so the two halves
       of the decision are read together. */
    expect(shell).toContain('appOpening');
  });

  it('carries no shadow, which the redesign gives only to the floating bar', () => {
    /* DIRECTION.md decision 2: separation is a 1px outline, and the app's
       one shadow belongs to the nav bar and its add button. Twelve elevated
       PIN keys on a screen with no chrome were the loudest place the old
       language survived. */
    const components = read('src/lib/styles/components.css');
    const pinBlock = components.slice(components.indexOf('.pin-pad {'), components.indexOf('.pin-status'));
    expect(pinBlock).not.toContain('box-shadow');
    expect(pinBlock).toContain('border: 1px solid var(--outline)');
  });
});

describe('the first run', () => {
  it('takes its sequence from the step model rather than from numbers here', () => {
    expect(onboarding).toContain("from '$lib/onboarding/steps'");
    /* `step === 3` is the shape this replaced: the order, the count, the
       progress label and the back arrow each knew the sequence separately. */
    expect(stripStyle(stripComments(onboarding))).not.toMatch(/step === \d/);
  });

  it('offers a way straight into the app on every step but the finish', () => {
    /* The finish's own button is that way out, so a second one beside it
       would be two controls doing one thing. */
    expect(onboardingMarkup).toContain("{#if step !== 'done'}");
    expect(onboardingMarkup).toContain('data-leave-setup');
  });

  it('offers a skip on exactly the steps the model says are skippable', () => {
    expect(onboardingMarkup).toContain('{#if isSkippable(step)}');
    expect(onboardingMarkup).toContain('data-skip-step');
  });

  it('leaves and finishes through one function, so the two cannot drift', () => {
    /* "Straight to the app" and "Start writing" are the same act: keep what
       was chosen, mark the first run done, go. Leaving early routes through
       one more function first (ticket 54): before an access mode is chosen
       there is no keystore for complete()'s writes to land in, so leave()
       detours through the lock step instead of writing straight to prefs -
       but it is still the one place either control's write can come from. */
    expect(onboardingMarkup.match(/onclick=\{complete\}/g) ?? []).toHaveLength(1);
    expect(onboardingMarkup).toContain('onclick={leave}');
    expect(onboarding).toMatch(/function leave\(\)[\s\S]*?complete\(\);/);
    expect(onboarding).toContain('prefs.onboarded = true;');
    expect(onboarding).toContain('goto(onboardingDestination())');
  });

  it('applies the disguise through the module that orders it, never inline', () => {
    /* Ticket 32. The route may hold the answer and may supply the four
       steps, but the sequence - write, flush, disguise, leave - is
       onboarding/complete.ts's, where the Node tier can hold it to the
       order. An assignment to prefs.disguise anywhere in this file that is
       not the durable one handed to completeSetup is the defect this
       catches: on Android it flips the launcher alias and kills the
       process, so writing it early ends the first run rather than the
       step. */
    expect(onboarding).toContain('completeSetup({');
    expect(onboarding).toContain("setPreferenceDurably('disguise', true)");
    expect(onboarding.match(/prefs\.disguise\s*=/g) ?? []).toHaveLength(0);
  });

  it('never turns app lock on by itself', () => {
    /* The toggle is a choice to set a PIN, not a PIN. `appLock` becomes true
       on the lock screen, once four digits have been typed twice. */
    expect(onboarding).not.toContain('prefs.appLock = true');
  });

  it('draws no sun at all under disguise', () => {
    /* ADR-0035's reading, applied to the one screen that comes before
       anything else: a crisp flag is not deniable at a glance, and being
       first is not an exemption. */
    expect(onboardingMarkup).toContain('{#if !prefs.disguise}');
    expect(onboardingMarkup.indexOf('{#if !prefs.disguise}')).toBeLessThan(
      onboardingMarkup.indexOf('<FlagSun />')
    );
  });

  it('offers one flow whatever disguise says, and reads it off the model', () => {
    /* ADR-0079: the flag step used to leave the flow under disguise, which
       guarded a state no real install can reach. One list now, and the
       route still asks steps.ts for it rather than counting for itself,
       which is what keeps a change to the list correct everywhere at
       once. */
    expect(onboardingSteps.length).toBe(0);
    expect(onboardingSteps()).toContain('flag');
    expect(onboarding).toContain('onboardingSteps()');
    expect(onboarding).not.toContain('onboardingSteps(prefs.disguise)');
    expect(stripStyle(stripComments(onboarding))).not.toMatch(/ONBOARDING_STEPS|\b7\b/);
  });

  it('counts its steps for a screen reader on the sun, not on a rail', () => {
    /* Ticket 29: the sun is the only progress meter. The step count is its
       accessible name rather than visible text, so the growing circle still
       says which step this is. Ticket 33 moved the sun inside the field's
       own paint, where the moving edge clips it. */
    expect(onboardingMarkup).not.toContain('role="progressbar"');
    expect(onboardingMarkup).toMatch(
      /class="setup-sun"[\s\S]*?role="img"[\s\S]*?aria-label=\{m\.ob_step_of/
    );
  });

  it('moves a step change on the field\'s own edge, not on a shared axis', () => {
    /* Ticket 33, DIRECTION.md rules 10 and 12. A step change is the field's
       bottom edge being pulled to the height the next step needs, with the
       question printed on it and the answers standing under it riding down
       with it - the same movement a door change makes, and the reason both
       read their numbers out of one place. The shared-axis slide this
       replaces predated every rule in DIRECTION.md.

       What is checked is that the geometry is still borrowed rather than
       invented here: the parts come from navigation.ts, the edge from
       stepBlind, and neither the axis nor a curve of this screen's own is
       left behind. */
    expect(onboarding).toContain("from '$lib/motion/navigation'");
    expect(onboarding).toContain("from '$lib/motion/stepBlind'");
    expect(onboardingMarkup).toContain('use:blindEdge');
    expect(onboardingMarkup).toMatch(/in:fieldPart=\{\{ printed: true \}\}/);
    expect(onboardingMarkup).toMatch(/out:fieldPart=\{\{ printed: true \}\}/);
    expect(onboarding).not.toContain('sharedAxisX');
    /* The edge, and everything riding it, is one clock: --dur-slow on the
       settle sampled per move. A second duration written here is how the
       question and the page it sits on would come apart.

       The clock moved out of this screen's own block and into the shared
       sheet when the gates took the same field (redesign ticket 34), so
       what is asserted here is that the screen wears the shared drawing and
       writes no second clock of its own. Two surfaces reading one set of
       numbers is the whole point of rules 12 and 15 sharing a field. */
    expect(onboardingMarkup).toMatch(/class="setup step-field-host"/);
    expect(onboardingMarkup).toMatch(/class="setup-field step-field"/);
    expect(onboardingMarkup).toContain('class="step-field-ask"');
    expect(onboardingMarkup).toContain('class="step-field-below"');
    const styles = onboarding.slice(onboarding.indexOf('<style>'));
    expect(styles).not.toMatch(/transition-property:\s*--blind-edge/);
    expect(styles).not.toMatch(/cubic-bezier/);
    const components = read('src/lib/styles/components.css');
    expect(ruleBody(components, '.step-field-host')).toMatch(/transition-property:\s*--blind-edge/);
    expect(ruleBody(components, '.step-field-host')).toMatch(/var\(--dur-slow\)/);
  });

  it('takes its surfaces from the kit and draws no card of its own', () => {
    /* The same rule Home was held to (DIRECTION.md 2b): `.card` and
       `.list-group` are the vocabulary the screen tickets replace. */
    expect(onboardingMarkup).not.toMatch(/class="[^"]*\bcard\b/);
    expect(onboardingMarkup).not.toMatch(/class="[^"]*\blist-group\b/);
  });
});
