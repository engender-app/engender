/* The rules the chromeless screens keep after the rebuild (phase 5 ticket
   26), at the level their source can be held to.

   What makes them right is mostly proportion and copy, which an eye and the
   walkthrough settle between them. What is left is mechanical, and every
   one of these is something a later ticket could quietly put back: a sixth
   copy of the gate frame, a shadow on a screen the redesign gave no
   shadows, a journal read on a screen that renders before the journal is
   open, or the flag showing on a screen someone reached while disguised. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { onboardingSteps } from '../src/lib/onboarding/steps';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const stripScript = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');
/** Block comments out, so a rule against a shape can be written down in a
    comment next to the code that replaced it without failing itself. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

const GATES = [
  'src/lib/components/LockScreen.svelte',
  'src/lib/components/PassphraseGate.svelte',
  'src/lib/components/AndroidKeyGate.svelte',
  'src/lib/components/DeviceBoundRecovery.svelte',
  'src/lib/components/SchemaTooNew.svelte'
];

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

  it('draws no flag and names the app nowhere', () => {
    /* The disguise question, answered by there being nothing to answer: no
       gate carries the sun, the stripes or the app's name, so none of them
       has a disguised variant to get wrong. */
    for (const path of GATES) {
      const source = read(path);
      expect(source, path).not.toContain('FlagSun');
      expect(source, path).not.toContain('activeFlag');
      expect(source, path).not.toContain('m.app_name()');
    }
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
    expect(stripComments(onboarding)).not.toMatch(/step === \d/);
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
       was chosen, mark the first run done, go. */
    expect(onboardingMarkup.match(/onclick=\{complete\}/g) ?? []).toHaveLength(2);
    expect(onboarding).toContain('prefs.onboarded = true;');
    expect(onboarding).toContain('goto(onboardingDestination(appLock));');
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

  it('takes the flag step out of the flow under disguise, rather than hiding it', () => {
    /* The step draws eight pride flags and names them, which is a stronger
       tell than the sun the rule above covers. Read off the model rather
       than off the markup: the route asks steps.ts what the flow is, so a
       guard added to the swatches and forgotten on the progress rail, the
       back arrow or the step count cannot pass this. */
    expect(onboardingSteps(true)).not.toContain('flag');
    expect(onboardingSteps(false)).toContain('flag');
    expect(onboarding).toContain('onboardingSteps(prefs.disguise)');
    /* And nothing in the route counts steps for itself, which is what makes
       the shorter flow correct everywhere at once. */
    expect(stripComments(onboarding)).not.toMatch(/ONBOARDING_STEPS|\b7\b/);
  });

  it('crosses its steps on the tier-2 axis rather than inventing a transition', () => {
    expect(onboarding).toContain("from '$lib/motion/navigation'");
    expect(onboardingMarkup).toContain('in:sharedAxisX');
    expect(onboardingMarkup).toContain('out:sharedAxisX');
  });

  it('takes its surfaces from the kit and draws no card of its own', () => {
    /* The same rule Home was held to (DIRECTION.md 2b): `.card` and
       `.list-group` are the vocabulary the screen tickets replace. */
    expect(onboardingMarkup).not.toMatch(/class="[^"]*\bcard\b/);
    expect(onboardingMarkup).not.toMatch(/class="[^"]*\blist-group\b/);
  });
});
