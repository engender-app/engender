<script lang="ts">
  /* Older code, newer Journal (ticket 04, ADR-0006).

     Reachable in practice rather than in theory: a stale service worker can
     serve the previous release after a newer one has already migrated the
     Journal, and a rolled-back deployment does the same on purpose. Guessing
     at a schema from the future is how data gets mangled quietly, so the app
     refuses - and whoever reads this has just been shut out of their own
     diary, so the screen says what happened, that nothing was changed, and
     what gets them back in.

     The action is the fix for the commonest cause: fetch the worker again,
     and if a newer release turns up, hand the app over to it. When the origin
     itself has gone back a release there is nothing to find, and saying so is
     better than a button that appears to do nothing. */

  import { m } from '$lib/paraglide/messages';
  import { applyUpdate, checkForNewerRelease } from '$lib/pwa/update';
  import Icon from './Icon.svelte';
  import PrideAurora from './PrideAurora.svelte';

  let looking = $state(false);
  let nothingNewer = $state(false);

  async function lookForNewer() {
    if (looking) return;
    looking = true;
    nothingNewer = false;
    if (await checkForNewerRelease()) {
      // Reloads onto the new release, so this screen is replaced by a boot
      // that can read the Journal. Nothing is in flight to interrupt: this
      // one never opened it.
      await applyUpdate();
      return;
    }
    nothingNewer = true;
    looking = false;
  }
</script>

<div class="screen">
  <PrideAurora />
  <div class="applock">
    <div class="applock-badge"><Icon name="alert" size={30} /></div>
    <h1 class="ob-title" style="text-align:center">{m.boot_schema_too_new_title()}</h1>
    <p class="ob-text" style="text-align:center" data-schema-too-new>{m.boot_schema_too_new_body()}</p>
    <div class="stack-3" style="margin-top:var(--space-4)">
      <button class="btn btn-primary" data-look-for-newer disabled={looking} onclick={lookForNewer}>
        <span>{looking ? m.boot_schema_too_new_looking() : m.boot_schema_too_new_retry()}</span>
      </button>
      {#if nothingNewer}
        <!-- SF-004: this result used to appear with no announcement - a
             silent content swap for anyone not looking at the screen. -->
        <p class="ob-text small" style="text-align:center" role="status" data-nothing-newer>
          {m.boot_schema_too_new_still_old()}
        </p>
      {/if}
    </div>
  </div>
</div>
