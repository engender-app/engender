<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { resetApp } from '$lib/stores/boot.svelte';
  import GateScreen from './GateScreen.svelte';
  import RecoveryKeyEntry from './RecoveryKeyEntry.svelte';
  import { recoveryKeyPresence, refreshRecoveryKeyPresence } from '$lib/data/recoveryKeyPresence.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let resetOpen = $state(false);
  let restoringArchive = $state(false);
  let resetting = $state(false);
  let resetError = $state('');
  refreshRecoveryKeyPresence();
  let usingRecoveryKey = $state(false);
  let body = $derived(recoveryKeyPresence.exists ? m.dbr_body_recoverable() : m.dbr_body());

  async function confirmReset() {
    if (resetting) return;
    resetting = true;
    try {
      await resetApp(restoringArchive ? 'restore' : 'welcome');
    } catch (error) {
      console.error('the app reset failed', error);
      resetting = false;
      resetOpen = false;
      resetError = m.reset_failed();
    }
  }
</script>

{#if usingRecoveryKey}
  <RecoveryKeyEntry onBack={() => (usingRecoveryKey = false)} />
{:else}
<GateScreen title={m.dbr_title()}>
  <!-- One body per state rather than one body plus a caveat. The original
       ends "so this copy cannot be reopened", which above a button that
       reopens it is the exact thing docs/ui-copy.md forbids on a risk
       screen - and a render is what caught it, because both sentences read
       fine on their own. -->
  <!-- Nothing about the recovery key, including which body this is, until
       the answer is in: at first paint this screen used to say "this copy
       cannot be reopened" over a journal that had a key, and correct itself
       a frame later. A title with no body for one frame is the honest
       version (docs/ui-copy.md, the screens that carry risk). -->
  {#if recoveryKeyPresence.known}
  <p class="gate-body" data-device-bound-recovery>{body}</p>
  {#if recoveryKeyPresence.exists}
    <div class="gate-actions">
      <button class="btn btn-primary" data-use-recovery-key onclick={() => (usingRecoveryKey = true)}>
        <span>{m.rke_open()}</span>
      </button>
    </div>
  {:else}
    <p class="gate-body" data-device-recovery-none>
      {m.dbr_recovery_none()}
    </p>
  {/if}
  {/if}
  <p class="gate-body" data-device-archive-help>{m.dbr_archive_body()}</p>
  <div class="gate-actions">
    <button
      class={recoveryKeyPresence.exists ? 'btn btn-soft' : 'btn btn-primary'}
      data-open-archive-recovery
      onclick={() => { restoringArchive = true; resetOpen = true; }}
    >
      <span>{m.dbr_archive_open()}</span>
    </button>
    <button class="btn btn-ghost" data-open-device-reset onclick={() => { restoringArchive = false; resetOpen = true; }}>
      <span>{m.dbr_open_reset()}</span>
    </button>
  </div>
  {#if resetError}
    <p class="pin-status small" role="alert" data-device-reset-failed>{resetError}</p>
  {/if}
</GateScreen>
{/if}

<Sheet bind:open={resetOpen} title={restoringArchive ? m.dbr_archive_open() : m.dbr_open_reset()} onRequestClose={() => { if (!resetting) resetOpen = false; }}>
  <h3>{restoringArchive ? m.dbr_archive_open() : m.dbr_open_reset()}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">{recoveryKeyPresence.exists ? m.dbr_recovery_offer() : m.pp_forgot_no_recovery()}</span>
      {body}
    </div>
  </div>
  <p class="ob-text">{restoringArchive ? m.dbr_archive_replace_body() : m.reset_offer_archive_password()}</p>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-device-reset data-confirm-archive-reset={restoringArchive || undefined} disabled={resetting} onclick={confirmReset}>
      <span>{resetting ? m.reset_running() : restoringArchive ? m.dbr_archive_confirm() : m.reset_confirm()}</span>
    </button>
    <button class="btn btn-ghost" disabled={resetting} onclick={() => (resetOpen = false)}>
      <span>{m.reset_keep_trying()}</span>
    </button>
  </div>
</Sheet>