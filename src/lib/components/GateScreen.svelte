<script lang="ts">
  /* The shell the five pre-unlock gates and the mid-session lock are built
     from (phase 5 ticket 26; redressed by redesign ticket 34).

     They were six copies of the same fourteen lines, and the copies had
     already drifted - three different inline `text-align:center` styles, two
     different badge icon sizes, onboarding's classes doing duty on screens
     that are not onboarding. A gate is the same object every time, so it is
     one object here.

     **What the shell owns now is the field** (DIRECTION.md rule 15: a gate is
     a step with nothing to skip). It is rule 12's shape with everything a
     gate cannot have taken out - no sun, no back, no skip, no leave, no
     progress - so what is left is a field from under the status bar, and
     under its bottom edge, on the page, whatever the gate needs: one line,
     the control, the status line, and under a hairline the way out that is
     not a way in. `--field` and `--field-ink` are published on <html> by
     activeFlag. This gate overrides them with `--surface-2` and `--text`
     while disguise is on, before unlock.

     **What the field holds.** On an unlock (`unlock`: the PIN, passphrase,
     biometric and device-key gates and the mid-session lock) it is the
     person's flag with nothing written on it, at the height the title used
     to give it (tester-report-02 ticket 07: a tester called the old field,
     the app's name on one of the flag's colours, "unused potential" on the
     screen a person meets every time). $lib/theme/gateFlag decides and
     paints; under disguise it answers nothing, so a disguised gate is the
     neutral field and the decoy's name exactly as before, and no colour of
     the flag reaches it. A gate that is not an unlock paints its own title
     at 48 on the flag's second colour. A demo build reads `?gateFlag=` to
     show the four drawings on the sign-off page.

     **What the title says, once, for all six.** An unlock never says the
     person's name. The mid-session lock used to greet by name because the
     journal was open behind it, but a lock screen is the surface most likely
     to be read by somebody other than its owner, and the chosen name can out
     the person holding the phone, disguise or not (release-blockers ticket
     12). Everywhere else the name lives in the encrypted journal and the
     screen renders before it can be read anyway, which is what the three
     separate greetings this replaced were each working around - "Hi" with
     nobody to say it to, "Welcome back" on a screen that cannot know whether
     anybody has been here before. So an unlock's title is the wordmark,
     whichever secret it asks for. It is no longer painted on an unlock
     without disguise: it stays the screen's level-one heading, visually
     hidden, so the screen's accessible name is what it was, and the flag on
     the field is what the handover to Today carries instead (appOpening.ts
     and app.css: Today's paint fades in over the flag while the edge opens).
     Under disguise it is painted, as the decoy's name. Always through `appWordmark`, never
     `m.app_name()`: under disguise the name on a lock screen is the one that
     must not be the real one (ADR-0035). A gate that is not an unlock keeps
     its own title, because what a conversion is about to do, and what the
     access-mode module is asking, are the things those screens are for.

     What it deliberately does not own is the line under the title. Every gate
     puts different attributes on that line - a `role="status"` on the
     conversion's progress, an `aria-live` on the Android prompt's outcome, a
     walkthrough handle on each - and folding it into a prop would mean a
     second prop for the attributes and a third for the ones that are markup
     rather than a string. So the gate writes its own `<p class="gate-body">`
     and everything below it, which is also what makes the conversion
     screen's progress rail and the PIN pad fit in the same shell without
     either being a special case.

     **What went, and why.** The 60px `--accent-soft` disc with an icon in it,
     and the `tone` prop that turned it red on the screens that had bad news.
     Rule 15 enumerates what a gate's field holds and a mark is not on the
     list; the disc's own comment already argued the narrow version of this -
     "the gates say what happened in words, and a red disc is not one of
     them" - and rule 12 forbids a step a notice, a card or a second heading,
     so there is nowhere for the alert to move to. The words carry it, which
     is what docs/ui-copy.md asks of the risk screens anyway. The disc was
     also 80px of a 568px window (its own height plus its margin), which is
     most of what rule 14's no-scroll floor needed back.

     **No entrance, and this is where that is written down.** A gate is what a
     cold start or a mid-session lock lands on. A cold start has nothing to
     come from, and the lock arriving is the one state change in the app whose
     whole value is being instant - somebody is walking towards the person
     holding the phone. So arrival is a cut on every gate, deliberately, and
     it is the only cut left inside a gate: everything after the first frame
     moves (ADR-0078). The field's edge travels when the title changes, the
     page under it rides that edge, the dots fill and empty, a refusal gives
     the digits back, the wait drains, and the unlock itself is the app
     opening rather than this screen being replaced ($lib/motion/appOpening).

     The reverse of that arrival is not a cut. Leaving a gate for the app is
     the moment the whole screen exists for, and it is the one piece of motion
     in the product somebody sees hundreds of times. */

  import { focusNamedTarget } from '$lib/navigation/arrivalFocus';
  import type { Snippet } from 'svelte';

  import { fieldPart } from '$lib/motion/navigation';
  import { blindEdge } from '$lib/motion/stepBlind';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { gateDrawsFlag, gateFlagChoice, gateStripes, gateSun } from '$lib/theme/gateFlag';
  import Mark from './Mark.svelte';

  let {
    title,
    unlock = false,
    children,
    ...rest
  }: {
    title: string;
    /** The title is the wordmark: this gate asks for the journal's secret.
        Only an unlock draws the flag, and only without disguise. */
    unlock?: boolean;
    children: Snippet;
    /** The gate's own attributes: its walkthrough handle, mostly. */
    [attribute: string]: unknown;
  } = $props();

  /* Read once: a demo build's `?gateFlag=` is the sign-off page choosing an
     option, and a production build always answers the same. */
  const choice = gateFlagChoice();
  let flag = $derived(gateDrawsFlag({ unlock, disguised: prefs.disguise }) ? choice : undefined);
  /* The paint the field wears. Nothing here is computed under disguise or on
     a gate that is not an unlock: `flag` is undefined there, so no stripe
     reaches the style attribute at all. */
  let paint = $derived(
    flag === 'stripes' || flag === 'stripes-wordmark'
      ? gateStripes(activeFlag.stripes)
      : flag === 'sun'
        ? gateSun(
            activeFlag.palette === 'polish' && activeFlag.stripes.length
              ? [activeFlag.stripes[activeFlag.dark ? 0 : 1]]
              : activeFlag.stripes,
            'calc(var(--blind-edge) - var(--space-2))'
          )
        : undefined
  );
  /* The wordmark is painted only where no flag replaced it, or small under
     the stripes in that one option; everywhere else it stays the screen's
     accessible name. */
  let wordmarkPainted = $derived(!flag);
</script>

<div class="screen screen-gate" data-gate-frame data-gate-flag={flag}
  style:--field={prefs.disguise ? 'var(--surface-2)' : undefined}
  style:--field-ink={prefs.disguise ? 'var(--text)' : undefined}>
  <!-- The host of the edge and everything that reads it (components.css).
       `blindEdge` is on the field below rather than here, because what it
       watches is the field's own height: the title changes when a gate walks
       from one of its screens to another - the mode list to the pad, the
       greeting to a refusal it has to name - and each of those has to travel
       rather than jump. -->
  <div class="gate step-field-host" {...rest}>
    <div class="gate-field step-field" data-gate-field {@attach (node) => blindEdge(node)?.destroy}>
      <!-- The paint, split from the box that measures it (ticket 28's
           mechanism): a block a window tall whose bottom edge is a clip, so
           the edge moves without a frame ever deforming the two bottom
           corners. `data-field-blind` is what hands it the blind's name for a
           navigation, which is how the unlock's handover closes this field
           into the app's rather than fading one out under another. -->
      <div class="step-field-paint" data-field-blind style:--gate-paint={paint}>
        {#if flag === 'mark'}<span class="gate-mark"><Mark size={46} /></span>{/if}
      </div>
      <!-- The title: the only display type on a gate and the only heading it
           has. Keyed on the words, because a gate asks more than one thing
           over its life and a heading that changed its text in place would be
           the one thing on the field that did not move. `data-field-part` so
           it is printed on the field and rides its edge on a navigation,
           fading where it stands rather than joining the screen's crossfade.
           Where the flag replaced it, it is the screen's name for a screen
           reader only and is not printed on the field. -->
      <div class="step-field-ask">
        {#key title}
          <h1
            class="gate-title"
            class:visually-hidden={!wordmarkPainted && flag !== 'stripes-wordmark'}
            class:gate-title-small={flag === 'stripes-wordmark'}
            {@attach focusNamedTarget}
            onintroend={(event) => {
              if (document.activeElement === document.body || document.activeElement?.closest('[inert]'))
                focusNamedTarget(event.currentTarget);
            }}
            data-gate-title
            data-field-part={wordmarkPainted || flag === 'stripes-wordmark' ? '' : undefined}
            in:fieldPart={{ printed: true }}
            out:fieldPart={{ printed: true }}
          >
            {title}
          </h1>
        {/key}
      </div>
    </div>

    <!-- Everything under the edge, riding it on the edge's own clock. The one
         region a gate may scroll (rule 14): the frame itself never does, so a
         gate cannot carry its own way out off the bottom of the window. -->
    <div class="gate-page step-field-below">{@render children()}</div>
  </div>
</div>
