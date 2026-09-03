<script lang="ts">
  /* Changing the journal passphrase (ticket 09). This rewraps the random
     data key under the new passphrase (crypto/keystore.ts) - the journal
     itself is not re-encrypted, so the change is instant regardless of
     journal size, and an interrupted one loses nothing: the keystore file
     is either the old wrap or the new one.

     Changing the passphrase only. *Adding* one to a journal that opens some
     other way used to live here too, under an `adding` branch that hid the
     current-passphrase field; ticket 53 moved that to /settings/access-mode,
     where it is one of three modes rather than an upgrade from the one the
     old "Skip" left people on. So this screen now has one job and needs no
     branch to say which it is doing. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { changeJournalPassphrase, MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import { toast } from '$lib/stores/toasts.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import RecoveryKeyOffer from '$lib/components/RecoveryKeyOffer.svelte';
  import { recoveryKeyExists } from '$lib/data/recovery-key';

  let current = $state('');
  let next = $state('');
  let confirmation = $state('');
  let error = $state('');
  let busy = $state(false);
  /* Whether a recovery key already covers this journal (ADR-0054, ticket
     sec-02). A changed passphrase rewraps the same data key, so an existing
     recovery key keeps working untouched - there is nothing to regenerate
     here and nothing to say about it. What is worth one line is the case
     where there is none, offered once, at the moment somebody is already
     thinking about the secret. */
  let hasRecoveryKey = $state(false);
  recoveryKeyExists().then((found) => {
    hasRecoveryKey = found;
  });
  let offering = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = '';

    if (next.length < MIN_PASSPHRASE_LENGTH) {
      error = m.pp_too_short({ min: String(MIN_PASSPHRASE_LENGTH) });
      return;
    }
    if (next !== confirmation) {
      error = m.pp_change_mismatch();
      return;
    }

    busy = true;
    try {
      await changeJournalPassphrase(current, next);
      toast(m.pp_changed_toast());
      if (!hasRecoveryKey) {
        offering = true;
        return;
      }
      goto('/settings/security');
    } catch {
      error = m.pp_change_wrong_current();
    } finally {
      busy = false;
    }
  }
</script>

<div class="screen">
  <ScreenHeader title={m.pp_change_title()} back="/settings/access-mode" />

  {#if offering}
    <RecoveryKeyOffer variant="secret-changed" onDismiss={() => goto('/settings/security')} />
  {:else}
  <div class="card">
    <p class="ob-text">{m.pp_change_body()}</p>
    <form class="stack-3" onsubmit={submit}>
      <div class="screen-part">
        <label class="field-label" for="current-passphrase">{m.pp_current_label()}</label>
        <input
          class="input"
          type="password"
          id="current-passphrase"
          name="current"
          autocomplete="current-password"
          bind:value={current}
          disabled={busy}
        />
      </div>
      <div>
        <label class="field-label" for="new-passphrase">{m.pp_new_label()}</label>
        <input
          class="input"
          type="password"
          id="new-passphrase"
          name="next"
          autocomplete="new-password"
          bind:value={next}
          disabled={busy}
        />
      </div>
      <div>
        <label class="field-label" for="new-passphrase-confirm">{m.pp_new_confirm_label()}</label>
        <input
          class="input"
          type="password"
          id="new-passphrase-confirm"
          name="confirmation"
          autocomplete="new-password"
          bind:value={confirmation}
          disabled={busy}
        />
      </div>
      <p class="pin-status small" role="alert" data-passphrase-status>{error}</p>
      <button class="btn btn-primary" type="submit" data-change-passphrase disabled={busy}>
        <span>
          {#if busy}{m.pp_change_running()}
          {:else}{m.pp_change_submit()}{/if}
        </span>
      </button>
    </form>
  </div>
{/if}
</div>
