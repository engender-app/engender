<script lang="ts">
  /* Typing a recovery key at a cold-boot gate (ADR-0054, ticket sec-02).

     One component rendered by both gates rather than a field added to each.
     The two gates ask for completely different things - a passphrase field,
     a PIN pad, a button that asks Android - but this screen is the same
     screen at both of them, and it was going to be the same fourteen lines
     twice.

     Three failures and three sentences, which is the whole reason
     data/recovery-key.ts throws three classes. A mistyped key is worth
     retyping and says so; a well-formed key that is not this journal's is
     not, and says that instead of sending somebody to look for the paper
     they are already holding; and a journal with no recovery key gets told
     that rather than being told its key is wrong. Only the second of those
     is the undiagnosed failure every other gate has (aesGcm.ts), and here
     it can be diagnosed because the check symbol did the diagnosing before
     the KDF was ever asked.

     Not offered where no recovery key exists. The gates read that before
     anything is typed, so this screen is never a door onto nothing.

     No throttle, and no attempt count, which is a decision rather than an
     omission. ADR-0041 settled what a growing delay is worth: it prices out
     somebody typing at the device and buys nothing against an attack that
     never loads the app's code. Against 120 bits neither of those attackers
     arrives, so a delay here would be theatre - and it would land on the
     person who is transcribing 25 characters off paper under stress, who is
     the only human being who will ever type into this field.

     Hidden while typed unless the person asks to see it (release-blockers
     ticket 12); RecoveryKeyField owns that and says why. */
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
