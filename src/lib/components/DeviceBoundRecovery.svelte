<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { resetApp } from '$lib/stores/boot.svelte';
  import GateScreen from './GateScreen.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let resetOpen = $state(false);
  let resetting = $state(false);
  let resetError = $state('');

  async function confirmReset() {
    resetting = true;
    try {
      await resetApp();
    } catch (error) {
      console.error('the app reset failed', error);
      resetting = false;
      resetOpen = false;
      resetError = m.reset_failed();
    }
  }
</script>

<GateScreen icon="alert" tone="alert" title={m.dbr_title()}>
  <p class="gate-body" data-device-bound-recovery>{m.dbr_body()}</p>
  <div class="gate-actions">
    <button class="btn btn-danger" data-open-device-reset onclick={() => (resetOpen = true)}>
      <span>{m.dbr_open_reset()}</span>
    </button>
  </div>
  {#if resetError}
    <p class="pin-status small" role="alert" data-device-reset-failed>{resetError}</p>
  {/if}
</GateScreen>

<Sheet bind:open={resetOpen} title={m.dbr_open_reset()}>
  <h3>{m.dbr_open_reset()}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">{m.pp_forgot_no_recovery()}</span>
      {m.dbr_body()}
    </div>
  </div>
  <p class="ob-text">{m.reset_offer_archive_password()}</p>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-device-reset disabled={resetting} onclick={confirmReset}>
      <span>{resetting ? m.reset_running() : m.reset_confirm()}</span>
    </button>
    <button class="btn btn-ghost" disabled={resetting} onclick={() => (resetOpen = false)}>
      <span>{m.reset_keep_trying()}</span>
    </button>
  </div>
</Sheet>