<script lang="ts">
  import { onDestroy } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import type { JournalAccessMode } from '$lib/data/journal-access-mode';
  import { RecoveryKeyMistypedError } from '$lib/crypto/recoveryKey';
  import { RecoveryKeyAbsentError } from '$lib/data/recovery-key';
  import { DecryptionFailedError } from '$lib/crypto/aesGcm';
  import { BiometricUnavailableError } from '$lib/data/webauthn-prf';
  import { UnlockCancelledError } from '$lib/lock/unlock-attempt';
  import PinEntry, { type PinAttempt } from './PinEntry.svelte';

  let { mode, onVerify, onCancel, allowRecovery = false, recoveryOnly = false }: {
    mode: JournalAccessMode;
    onVerify(secret: string, current: () => void): Promise<void>;
    onCancel(): void;
    allowRecovery?: boolean;
    recoveryOnly?: boolean;
  } = $props();
  let secret = $state('');
  let usingRecovery = $state(false);
  const recoveryInput = $derived(recoveryOnly || usingRecovery);
  let busy = $state(false);
  let error = $state('');
  let mounted = true;
  onDestroy(() => { mounted = false; secret = ''; });
  const current = () => { if (!mounted) throw new UnlockCancelledError(); };

  async function pin(entered: string, attemptCurrent: () => void): Promise<PinAttempt> {
    await onVerify(entered, () => { current(); attemptCurrent(); });
    return 'ok';
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try { await onVerify(secret, current); }
    catch (failure) {
      if (!mounted || failure instanceof UnlockCancelledError) return;
      error = failure instanceof RecoveryKeyMistypedError ? m.rke_mistyped()
        : failure instanceof RecoveryKeyAbsentError ? m.rke_absent()
        : failure instanceof DecryptionFailedError ? (recoveryInput ? m.rke_wrong() : m.pp_wrong())
        : failure instanceof BiometricUnavailableError ? m.protection_biometric_failed()
        : m.am_change_failed();
    } finally { secret = ''; busy = false; }
  }
</script>

<div class="stack-3" data-current-protection>
  {#if mode === 'pin' && !recoveryOnly}
    <p class="ob-text">{m.pin_change_current()}</p>
    <PinEntry onVerify={pin} />
  {:else}
    <form class="stack-3" onsubmit={submit}>
      {#if recoveryInput}
        <label class="field-label" for="current-protection-recovery">{m.rke_label()}</label>
        <input class="rule-input" id="current-protection-recovery" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" bind:value={secret} disabled={busy} required />
      {:else if mode === 'passphrase'}
        <label class="field-label" for="current-protection-secret">{m.pp_current_label()}</label>
        <input class="rule-input" id="current-protection-secret" type="password" autocomplete="off" data-private-input bind:value={secret} disabled={busy} required />
      {:else if mode === 'device-bound' && !isAndroid()}
        <p class="ob-text" data-protection-web-exception>{m.protection_web_exception()}</p>
      {:else}
        <p class="ob-text">{m.protection_biometric_body()}</p>
      {/if}
      <button class="btn btn-primary" type="submit" disabled={busy} data-confirm-current-protection>{m.protection_confirm()}</button>
    </form>
  {/if}
  {#if mode === 'unlocked' && isAndroid() && !recoveryOnly}
    <p class="ob-text">{m.protection_android_unlocked()}</p>
    {#if allowRecovery}
      <button class="btn btn-soft" type="button" disabled={busy} data-protection-use-recovery onclick={() => { usingRecovery = !usingRecovery; secret = ''; error = ''; }}>
        {usingRecovery ? m.protection_use_biometrics() : m.rke_open()}
      </button>
    {/if}
  {/if}
  <p class="small" role="alert" data-protection-status>{error}</p>
  <button class="btn btn-ghost" type="button" onclick={onCancel}>{m.cancel()}</button>
</div>
