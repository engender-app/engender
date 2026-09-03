<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { resetApp } from '$lib/stores/boot.svelte';
  import GateScreen, { gateBodyClass } from './GateScreen.svelte';
  import RecoveryKeyEntry from './RecoveryKeyEntry.svelte';
  import { recoveryKeyExists } from '$lib/data/recovery-key';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let resetOpen = $state(false);
  let resetting = $state(false);
  let resetError = $state('');
  /* The screen this app arrives at when a browser has thrown away the local
     key, and until ADR-0054 the only screen in the app with nothing on it
     but a reset. Two states now, and the second one matters as much as the
     first: where a recovery key exists this points at it, and where none
     does it says what would have helped, so the next journal is not lost
     the same way. Read on mount, before either sentence is drawn. */
  let hasRecoveryKey = $state(false);
  recoveryKeyExists().then((found) => {
    hasRecoveryKey = found;
  });
  let usingRecoveryKey = $state(false);
  let body = $derived(hasRecoveryKey ? m.dbr_body_recoverable() : m.dbr_body());

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

{#if usingRecoveryKey}
  <RecoveryKeyEntry onBack={() => (usingRecoveryKey = false)} />
{:else}
<GateScreen icon="alert" tone="alert" title={m.dbr_title()}>
  <!-- One body per state rather than one body plus a caveat. The original
       ends "so this copy cannot be reopened", which above a button that
       reopens it is the exact thing docs/ui-copy.md forbids on a risk
       screen - and a render is what caught it, because both sentences read
       fine on their own. -->
  <p class={gateBodyClass(body)} data-device-bound-recovery>{body}</p>
  {#if hasRecoveryKey}
    <div class="gate-actions">
      <button class="btn btn-primary" data-use-recovery-key onclick={() => (usingRecoveryKey = true)}>
        <span>{m.rke_open()}</span>
      </button>
    </div>
  {:else}
    <!-- The harder half to write. This person has just lost a journal and
         the screen must not read as blame, so it says what the thing is and
         that it is worth having next time, and stops - no "you should have",
         and nothing about what they did or did not do. -->
    <p class={gateBodyClass(m.dbr_recovery_none(), 'is-small')} data-device-recovery-none>
      {m.dbr_recovery_none()}
    </p>
  {/if}
  <div class="gate-actions">
    <button class="btn btn-danger" data-open-device-reset onclick={() => (resetOpen = true)}>
      <span>{m.dbr_open_reset()}</span>
    </button>
  </div>
  {#if resetError}
    <p class="pin-status small" role="alert" data-device-reset-failed>{resetError}</p>
  {/if}
</GateScreen>
{/if}

<Sheet bind:open={resetOpen} title={m.dbr_open_reset()}>
  <h3>{m.dbr_open_reset()}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">{hasRecoveryKey ? m.dbr_recovery_offer() : m.pp_forgot_no_recovery()}</span>
      {body}
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