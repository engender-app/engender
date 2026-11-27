<script lang="ts">
  /* Both cold-boot gates offer this entry only if the journal has a recovery
     key (ADR-0054). Distinguish invalid check symbol, a well-formed key which
     cannot open this journal, and no configured key. Validate the check
     symbol before running the KDF so typing errors can be corrected.

     The key contains 120 bits. An attempt delay would burden someone
     transcribing 25 characters and would leave offline guessing unaffected
     (ADR-0041). RecoveryKeyField hides input until the person reveals it. */
  import { m } from '$lib/paraglide/messages';
  import { submitRecoveryKeyUnlock } from '$lib/stores/boot.svelte';
  import { RecoveryKeyMistypedError } from '$lib/crypto/recoveryKey';
  import { RecoveryKeyAbsentError } from '$lib/data/recovery-key';
  import { UnlockCancelledError } from '$lib/lock/unlock-attempt';
  import GateScreen from './GateScreen.svelte';
  import RecoveryKeyField from './RecoveryKeyField.svelte';

  let { onBack }: { onBack: () => void } = $props();

  let typed = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = '';
    busy = true;
    try {
      await submitRecoveryKeyUnlock(typed);
      typed = '';
    } catch (e) {
      if (e instanceof UnlockCancelledError) return;
      error =
        e instanceof RecoveryKeyMistypedError
          ? m.rke_mistyped()
          : e instanceof RecoveryKeyAbsentError
            ? m.rke_absent()
            : m.rke_wrong();
    } finally {
      busy = false;
    }
  }
</script>

<GateScreen title={m.rk_title()} data-recovery-gate>
  <p class="gate-body" data-recovery-gate-body>{m.rke_body()}</p>
  <form class="gate-form" onsubmit={submit}>
    <RecoveryKeyField id="journal-recovery-key" label={m.rke_label()} bind:value={typed} disabled={busy} />
    <p class="pin-status small" role="alert" data-recovery-key-error>{error}</p>
    <div class="gate-actions">
      <button class="btn btn-primary" type="submit" data-submit-recovery-key disabled={busy}>
        <span>{m.rke_submit()}</span>
      </button>
    </div>
  </form>
  <div class="gate-foot">
    <button class="btn btn-ghost" type="button" data-recovery-key-back onclick={onBack}>
      <span>{m.back()}</span>
    </button>
  </div>
</GateScreen>
