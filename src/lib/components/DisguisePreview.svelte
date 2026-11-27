<script lang="ts">
  /* What the disguise looks like from outside the app, and what it does not cover. Settings
     has drawn this; setup's last question asks for the same thing, and two copies of a
     block whose whole job is to be accurate about the launcher is how the two drift.

     It says the same thing on both screens on purpose. Settings binds `on` to the stored
     preference, or to the answer its switch is saving while that write runs; setup binds it
     to the answer it is holding - but the icon, the name and the note do not vary with it.
     The disguise is what it is; `on` only says whether it is in force, which is the
     difference between a proposal and a description. */

  import { appWordmark } from '$lib/disguise/identity';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import Icon from './Icon.svelte';

  let { on }: { on: boolean } = $props();
</script>

<!-- `data-on` is written rather than left to the class, because the
     walkthrough grips handles and never structure: a bare attribute would
     also read as "true" while off (a valueless attribute renders as the
     string "true"), so it carries the boolean.

     Two cells, the places disguise reaches that a person sees most (FA
     43): the icon and its name where the app is started, and the lock
     screen. The lock cell is drawn the way GateScreen draws itself under
     disguise - the neutral field and the decoy's name - so the picture
     agrees with the screen it stands for. `data-disguise-name` stays on the
     launcher name alone: the walkthrough reads one name. -->
<div class="disguise-preview" class:is-on={on} data-disguise-preview data-on={on}>
  <figure class="disguise-cell">
    <span class="disguise-icon"><Icon name="book" size={22} /></span>
    <strong class="disguise-label" data-disguise-name>{m.disguise_name()}</strong>
    <figcaption class="muted small">{isAndroid() ? m.disguise_preview_home() : m.disguise_preview_tab()}</figcaption>
  </figure>
  <figure class="disguise-cell">
    <span class="disguise-lock" aria-hidden="true">
      <Icon name="lock" size={16} />
      <span class="disguise-lock-name">{m.disguise_name()}</span>
    </span>
    <figcaption class="muted small">{m.disguise_preview_lock()}</figcaption>
  </figure>
</div>
<!-- On Android the launcher alias switches at once, so there is nothing to warn about there
     - but the system's own screens never get a disguised variant, so the sheet names them
     plainly, along with the one thing disguise turns off while it is on. On web the
     manifest is the browser's to refresh, and a promise the app cannot keep is worse than
     none. -->
<p class="muted small">{isAndroid() ? m.disguise_android_gap_note() : `${m.disguise_installed_note({ appName: appWordmark(prefs.disguise, m.app_name(), m.disguise_name()) })} ${m.disguise_web_gap_note({ appName: appWordmark(prefs.disguise, m.app_name(), m.disguise_name()) })}`}</p>

<style>
  /* Off uses an outline and --text-2. Whole-element opacity at 0.6
     measured 4.04–6.13:1 and failed 8 of 16 contrast combinations. On uses
     the disguise's neutral surfaces.

     Keep the dashed preview border in both states so only colours change.
     Those interpolate over --dur-med while the rest of Setup keeps its own
     theme. */
  .disguise-preview {
    display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);
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
  .disguise-cell {
    margin: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: end;
    gap: var(--space-1);
    text-align: center;
  }
  .disguise-icon {
    width: 44px; height: 44px; border-radius: var(--r-block);
    background: var(--surface-2); color: var(--text-2);
    display: flex; align-items: center; justify-content: center;
    transition: background-color var(--dur-med);
  }
  .disguise-preview.is-on .disguise-icon { background: var(--surface); }
  .disguise-label { font-size: var(--text-sm); }
  /* A phone's lock screen in miniature: portrait, the padlock above the
     name, on the field GateScreen paints under disguise. Its ground follows
     the icon's, so the two cells lift together. */
  .disguise-lock {
    width: 44px; height: 64px; border-radius: var(--r-block);
    background: var(--surface-2); color: var(--text-2);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px;
    transition: background-color var(--dur-med), color var(--dur-med);
  }
  .disguise-preview.is-on .disguise-lock { background: var(--surface); color: var(--text); }
  .disguise-lock-name { font-size: var(--text-xs); font-weight: 600; }
</style>
