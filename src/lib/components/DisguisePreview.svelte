<script lang="ts">
  /* What the disguise looks like from outside the app, and what it does not
     cover. Settings has drawn this since ticket 15; setup's last question
     asks for the same thing (phase 10 redesign ticket 32), and two copies
     of a block whose whole job is to be accurate about the launcher is how
     the two drift.

     It says the same thing on both screens on purpose. Settings binds `on`
     to the stored preference, setup binds it to the answer it is holding -
     but the icon, the name and the note do not vary with it. The disguise
     is what it is; `on` only says whether it is in force, which is the
     difference between a proposal and a description. */

  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import { DECOY_NAME } from '$lib/disguise/identity';
  import Icon from './Icon.svelte';

  let { on }: { on: boolean } = $props();
</script>

<!-- `data-on` is written rather than left to the class, because the
     walkthrough grips handles and never structure: a bare attribute would
     also read as "true" while off (a valueless attribute renders as the
     string "true"), so it carries the boolean. -->
<div class="disguise-preview" class:is-on={on} data-disguise-preview data-on={on}>
  <span class="disguise-icon"><Icon name="book" size={22} /></span>
  <span>
    <!-- The disguise's own name, from the module every surface that names
         the app reads (disguise/identity.ts). An expression rather than a
         text node for the reason DecoyNotes gives: check-copy counts bare
         text as untranslated, and this word is the same in every
         language. -->
    <strong data-disguise-name>{DECOY_NAME}</strong><br />
    <span class="muted small">{isAndroid() ? m.disguise_preview_android() : m.disguise_preview_web()}</span>
  </span>
</div>
<!-- On Android the launcher alias switches at once, so there is nothing to
     warn about there - but Settings, the app-info screen and the widget
     picker never get a disguised variant, so that gap is named instead. On
     web the manifest is the browser's to refresh, and a promise the app
     cannot keep is worse than none. -->
<p class="muted small">{isAndroid() ? m.disguise_android_gap_note() : m.disguise_installed_note()}</p>

<style>
  /* Moved out of screens.css with the block itself: a class with one
     consumer belongs in that consumer's own style block, which is what
     check-screens-classes' baseline asks each ticket to do for one more
     of the long tail.

     P10-007/probe 2: whole-element opacity 0.6 for the "off" state
     computed to 4.04-6.13:1, failing 8/16 combinations - blending
     everything inside toward the page background shrinks the contrast
     between them. --text-2 (inherited by the plain "Notes" text) gives the
     same quieter, inactive look at a contrast the token layer already
     guarantees; the nested .muted.small line already used --text-2
     regardless.

     Off and on are a drawing and the thing drawn. Off, the block is an
     outline on the page: nothing is filled, because nothing is in force.
     On, it fills with --surface-2 and its tile lifts to --surface, so the
     preview is a solid object sitting on the page rather than a proposal
     about one - which is the difference the switch actually makes, and
     read at a glance rather than by comparing two border hues.

     The border stays dashed in both, because the block is a preview in
     both: this is never the launcher, it is a picture of it. And the
     colour it fills with is the disguise's own neutral pair rather than
     the flag's accent, which is the point of the thing being previewed
     (ADR-0035) and also what makes every property here animate - a
     border-style swap would snap in the middle of the fade.

     The whole change is background, border and text colour, all of which
     interpolate, so the switch is answered by one move at --dur-med rather
     than by a cut (ticket 25). Setup's own look does not respond to the
     switch at all (DIRECTION rule 12): this is the preview answering for
     itself, and it is the only thing on the step that does. */
  .disguise-preview {
    display: flex; align-items: center; gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1.5px dashed var(--outline);
    border-radius: var(--r-block);
    color: var(--text-2);
    background: transparent;
    transition:
      color var(--dur-med),
      border-color var(--dur-med),
      background-color var(--dur-med);
  }
  .disguise-preview.is-on { color: var(--text); background: var(--surface-2); }
  .disguise-icon {
    width: 44px; height: 44px; border-radius: var(--r-block);
    background: var(--surface-2); color: var(--text-2);
    display: flex; align-items: center; justify-content: center;
    transition: background-color var(--dur-med);
  }
  .disguise-preview.is-on .disguise-icon { background: var(--surface); }
</style>
