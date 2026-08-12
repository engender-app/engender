<script lang="ts">
  /* Changing the journal passphrase (ticket 09). This rewraps the random
     data key under the new passphrase (crypto/keystore.ts) - the journal
     itself is not re-encrypted, so the change is instant regardless of
     journal size, and an interrupted one loses nothing: the keystore file
     is either the old wrap or the new one. */
  import { goto } from '$app/navigation';
  import { changeJournalPassphrase, MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let current = $state('');
  let next = $state('');
  let confirmation = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = '';

    if (next.length < MIN_PASSPHRASE_LENGTH) {
      error = `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
      return;
    }
    if (next !== confirmation) {
      error = 'The new passphrase and its confirmation did not match.';
      return;
    }

    busy = true;
    try {
      await changeJournalPassphrase(current, next);
      toast('Passphrase changed. Update it in your password manager too.');
      goto('/settings');
    } catch {
      error = 'The current passphrase is not right.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label="Back to settings"><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">Journal passphrase</h1>
    <div class="header-action"></div>
  </header>

  <div class="card">
    <p class="ob-text">
      The passphrase wraps the key your journal is encrypted with, so changing it takes effect immediately
      and nothing is re-encrypted. The old passphrase stops working everywhere, including for this device's
      unlock screen. Gender Diary cannot recover a lost passphrase, so save the new one in a password manager
      before you change it.
    </p>
    <form class="stack-3" onsubmit={submit} style="margin-top:var(--space-4)">
      <div>
        <label class="field-label" for="current-passphrase">Current passphrase</label>
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
        <label class="field-label" for="new-passphrase">New passphrase</label>
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
        <label class="field-label" for="new-passphrase-confirm">New passphrase, once more</label>
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
        <span>{busy ? 'Changing…' : 'Change passphrase'}</span>
      </button>
    </form>
  </div>
</div>
