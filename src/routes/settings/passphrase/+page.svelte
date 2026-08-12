<script lang="ts">
  /* Changing the journal passphrase (ticket 09). This rewraps the random
     data key under the new passphrase (crypto/keystore.ts) - the journal
     itself is not re-encrypted, so the change is instant regardless of
     journal size, and an interrupted one loses nothing: the keystore file
     is either the old wrap or the new one. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
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
      goto('/settings');
    } catch {
      error = m.pp_change_wrong_current();
    } finally {
      busy = false;
    }
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.pp_change_title()}</h1>
    <div class="header-action"></div>
  </header>

  <div class="card">
    <p class="ob-text">{m.pp_change_body()}</p>
    <form class="stack-3" onsubmit={submit} style="margin-top:var(--space-4)">
      <div>
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
        <span>{busy ? m.pp_change_running() : m.pp_change_submit()}</span>
      </button>
    </form>
  </div>
</div>
