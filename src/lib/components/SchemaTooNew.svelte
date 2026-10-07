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
  import GateScreen from './GateScreen.svelte';
  import { collapse } from '$lib/motion/reveal';
  import { announce } from '$lib/stores/announcer.svelte';

  let looking = $state(false);
  /* What the last look found, said in the line under the button. 'reopen'
     is a newer release that could not take over this page (applyUpdate
     answered false): the button used to stay on "Looking…" for good then
     (after-release 06, L05-06). A look that throws says it could not
     look; a hand-over that throws after a newer release was found is
     still 'reopen', since the newer release is there. */
  let result = $state<'none' | 'reopen' | 'failed' | null>(null);

  const RESULT_LINE = {
    none: m.boot_schema_too_new_still_old,
    failed: m.boot_schema_too_new_check_failed,
    reopen: m.boot_schema_too_new_reopen
  };

  /* Said through the app's standing live region (announcer.ts) rather than
     by the line itself, which arrives already holding its words and is
     often not read for that reason (after-release 21). */
  $effect(() => {
    if (result) announce(RESULT_LINE[result]());
  });

  async function lookForNewer() {
    if (looking) return;
    looking = true;
    result = null;
    let found = false;
    try {
      found = await checkForNewerRelease();
      // Reloads onto the new release, so this screen is replaced by a boot
      // that can read the Journal. Nothing is in flight to interrupt: this
      // one never opened it.
      if (found && (await applyUpdate())) return;
      result = found ? 'reopen' : 'none';
    } catch (error) {
      console.error('could not look for a newer release', error);
      result = found ? 'reopen' : 'failed';
    }
    looking = false;
  }
</script>

<GateScreen title={m.boot_schema_too_new_title()}>
  <p class="gate-body" data-schema-too-new>{m.boot_schema_too_new_body()}</p>
  <div class="gate-actions">
    <button class="btn btn-primary" data-look-for-newer disabled={looking} onclick={lookForNewer}>
      <span>{looking ? m.boot_schema_too_new_looking() : m.boot_schema_too_new_retry()}</span>
    </button>
    {#if result === 'none'}
      <!-- SF-004: this result used to appear with no announcement - a
           silent content swap for anyone not looking at the screen. The
           effect above says it now. -->
      <p class="gate-body" data-nothing-newer transition:collapse>
        {m.boot_schema_too_new_still_old()}
      </p>
    {:else if result === 'failed'}
      <p class="gate-body" data-update-check-failed transition:collapse>
        {m.boot_schema_too_new_check_failed()}
      </p>
    {:else if result === 'reopen'}
      <p class="gate-body" data-newer-waiting transition:collapse>
        {m.boot_schema_too_new_reopen()}
      </p>
    {/if}
  </div>
</GateScreen>
