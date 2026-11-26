<script lang="ts">
  /* This shell draws the field and heading shared by the pre-unlock gates and
     the mid-session lock. Each gate supplies the body and controls through its
     snippet, so it can place status roles, live announcements and test handles
     on the elements they describe.

     An undisguised unlock draws Today's sun at rest, with room for every ring.
     It keeps the wordmark as a visually hidden heading. appOpening.ts holds the
     sun in place while the field opens around it. Other gates draw a 48px title.

     Under disguise, gateFlag suppresses the sun and the field uses --surface-2
     and --text. Callers use appWordmark to select the decoy name or
     m.app_name(). A chosen name can identify someone to a person
     who sees the lock screen.

     Arrival is a cut on every gate. The field edge travels
     on later state changes. Keep controls, status and the exit under the field.
     Only that region can scroll. */

  import { focusNamedTarget } from '$lib/navigation/arrivalFocus';
  import type { Snippet } from 'svelte';

  import { fieldPart } from '$lib/motion/navigation';
  import { blindEdge } from '$lib/motion/stepBlind';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { gateDrawsFlag } from '$lib/theme/gateFlag';
  import FlagSun from './FlagSun.svelte';

  let {
    title,
    unlock = false,
    children,
    ...rest
  }: {
    title: string;
    /** The title is the wordmark: this gate asks for the journal's secret.
        Only an unlock draws the sun, and only without disguise. */
    unlock?: boolean;
    children: Snippet;
    /** The gate's own attributes: its walkthrough handle, mostly. */
    [attribute: string]: unknown;
  } = $props();

  /* Nothing of the sun is drawn under disguise or on a gate that is not an
     unlock: `sun` is false there, FlagSun never mounts, and the field keeps
     its title's height (screens.css sizes it to the sun only behind
     `data-gate-sun`). */
  let sun = $derived(gateDrawsFlag({ unlock, disguised: prefs.disguise }));
</script>

<div class="screen screen-gate" data-gate-frame data-gate-sun={sun ? '' : undefined}
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
      <div class="step-field-paint" data-field-blind>
        <!-- Today's sun, inside the blind as Today nests its own:
             unnamed in the opening, it rides the blind's capture rather than
             a hidden one, and is the same drawing in the same place as
             Today's, so the field opens around one sun. -->
        {#if sun}<FlagSun still />{/if}
      </div>
      <!-- The title: the only display type on a gate and the only heading it
           has. Keyed on the words, because a gate asks more than one thing
           over its life and a heading that changed its text in place would be
           the one thing on the field that did not move. `data-field-part` so
           it is printed on the field and rides its edge on a navigation,
           fading where it stands rather than joining the screen's crossfade.
           Where the sun replaced it, it is the screen's name for a screen
           reader only and is not printed on the field. -->
      <div class="step-field-ask">
        {#key title}
          <h1
            class="gate-title"
            class:visually-hidden={sun}
            {@attach focusNamedTarget}
            onintroend={(event) => {
              if (document.activeElement === document.body || document.activeElement?.closest('[inert]'))
                focusNamedTarget(event.currentTarget);
            }}
            data-gate-title
            data-field-part={sun ? undefined : ''}
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
