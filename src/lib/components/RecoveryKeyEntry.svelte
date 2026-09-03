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
     anything is typed, so this screen is never a door onto nothing. */
  import { m } from '$lib/paraglide/messages';
  import { submitRecoveryKeyUnlock } from '$lib/stores/boot.svelte';
  import { RecoveryKeyMistypedError } from '$lib/crypto/recoveryKey';
  import { RecoveryKeyAbsentError } from '$lib/data/recovery-key';
  import GateScreen, { gateBodyClass } from './GateScreen.svelte';

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

<GateScreen icon="key" title={m.rke_title()} data-recovery-gate>
  <p class={gateBodyClass(m.rke_body())} data-recovery-gate-body>{m.rke_body()}</p>
  <form class="gate-form" onsubmit={submit}>
    <div>
      <label class="field-label" for="journal-recovery-key">{m.rke_label()}</label>
      <!-- Wide enough to hold the whole key and shaped like the screen it
           was written down from, so somebody comparing the two is comparing
           the same thing. Autocapitalise on and autocorrect off: the
           alphabet is uppercase, and every correction feature turns a valid
           key into a mistyped one. -->
      <input
        class="input rke-input"
        type="text"
        id="journal-recovery-key"
        name="recovery-key"
        autocapitalize="characters"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        bind:value={typed}
        data-recovery-key-input
        disabled={busy}
      />
    </div>
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

<style>
  /* Monospace for the same reason the shown key is: this is the one input
     in the app where a person is transcribing random characters, and a 0
     that looks like an O costs them an attempt. */
  .rke-input {
    font-family: var(--font-mono, ui-monospace, monospace);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
