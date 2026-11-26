<script lang="ts">
  /* Require a new access mode after recovery unlock (ADR-0054). The
     journal is open behind this surface and the recovery key remains
     valid. Reloading returns to the gate where that key still works.

     Offer a mode different from the current one. Replacing a PIN in place
     would replace the binding key before the new keystore is written and
     could leave the on-disk keystore unreadable. addJournalPin refuses that
     transition. Users can set a PIN in Settings after choosing another mode. */
  import { onDestroy } from 'svelte';
  import { UnlockCancelledError } from '$lib/lock/unlock-attempt';
  import CurrentProtection from './CurrentProtection.svelte';
  import { m } from '$lib/paraglide/messages';
  import { bootState, changeAccessModeAfterRecovery } from '$lib/stores/boot.svelte';
  import { BiometricUnavailableError } from '$lib/data/webauthn-prf';
  import { toast } from '$lib/stores/toasts.svelte';
  import GateScreen from './GateScreen.svelte';
  import AccessModeSetup, { type AccessSetupMode } from './AccessModeSetup.svelte';

  let busy = $state(false);
  let error = $state('');
  let chosen = $state<AccessSetupMode | null>(null);
  let retry = $state.raw<{ mode: AccessSetupMode; secret: string } | null>(null);
  let mounted = true;
  onDestroy(() => { mounted = false; retry = null; });
  const current = () => { if (!mounted) throw new UnlockCancelledError(); };

  async function choose(mode: AccessSetupMode, secret: string) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      /* Clears the debt itself, after the wrap lands (boot.svelte.ts), so
         this screen goes when there is a secret the person has and not
         before. Nothing here navigates: the layout renders the route again
         the moment the flag clears. */
      await changeAccessModeAfterRecovery(mode, secret, current);
      toast(m.am_changed_toast());
    } catch (e) {
      console.error('choosing an access mode after a recovery unlock failed', e);
      error = e instanceof BiometricUnavailableError ? m.am_biometric_unavailable() : m.am_change_failed();
      if (mounted) retry = { mode, secret };
    } finally {
      busy = false;
    }
  }
  async function retryWithRecovery(typed: string, attemptCurrent: () => void) {
    const operation = retry;
    if (!operation) throw new UnlockCancelledError();
    await changeAccessModeAfterRecovery(operation.mode, operation.secret, () => { current(); attemptCurrent(); }, typed);
    toast(m.am_changed_toast());
  }
</script>

<GateScreen title={m.rkr_title()} data-post-recovery-setup>
  <p class="gate-body" data-post-recovery-body>{m.rkr_body()}</p>
  {#if retry !== null}
    <p class="gate-body">{m.protection_recovery_retry()}</p>
    <CurrentProtection mode={bootState.accessMode} recoveryOnly onVerify={retryWithRecovery} onCancel={() => { retry = null; }} />
  {:else}
    <AccessModeSetup purpose="recovered" current={bootState.accessMode} {busy} {error} onChoose={choose} bind:chosen />
  {/if}
</GateScreen>
