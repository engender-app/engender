<script lang="ts">
  /* The recovery key, from Settings (ADR-0054, ticket sec-01).

     Three states and they are the whole screen: this journal has no
     recovery key, it has one, or one has just been minted and is on screen
     for the only time it ever will be. The third is not a variant of the
     second - it is the only moment the characters exist anywhere, and
     leaving it is irreversible - so it gets its own branch rather than a
     flag on the second.

     Nothing here can show a key again, and that is a property of the design
     rather than a decision this screen makes: only the wrap is stored
     (crypto/recoveryWrap.ts), so replace is the only answer to "I am not
     sure I still have it". */
  import { m } from '$lib/paraglide/messages';
  import { mintRecoveryKey, revokeRecoveryKey } from '$lib/data/recovery-key';
  import { recoveryKeyPresence, refreshRecoveryKeyPresence } from '$lib/data/recoveryKeyPresence.svelte';
  import { journalDataKey } from '$lib/stores/boot.svelte';
  import { printCurrentPage } from '$lib/print/print';
  import { toast } from '$lib/stores/toasts.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  /** The minted key, present only between minting and leaving the screen.
      Held in one place and never written anywhere else. */
  let shown = $state<string | null>(null);
  let confirming = $state<'replace' | 'revoke' | null>(null);
  let busy = $state(false);

  refreshRecoveryKeyPresence();

  async function mint() {
    if (busy) return;
    busy = true;
    try {
      /* Awaited rather than read: the key is announced once per page when
         the journal opens, and this screen can be reached by a goto that
         beats it. journalDataKey() is the same door the entry-draft mirror
         goes through. */
      shown = await mintRecoveryKey(await journalDataKey());
      await refreshRecoveryKeyPresence();
      confirming = null;
    } catch {
      toast(m.rk_failed());
    } finally {
      busy = false;
    }
  }

  async function revoke() {
    if (busy) return;
    busy = true;
    try {
      await revokeRecoveryKey();
      await refreshRecoveryKeyPresence();
      confirming = null;
      toast(m.rk_removed_toast());
    } catch {
      toast(m.rk_failed());
    } finally {
      busy = false;
    }
  }

  /* Deliberate, and worth naming because it reads as a contradiction of the
     screen's own advice: a Copy button on a secret this copy says to keep
     off the device. What it is for is a password manager, which is where
     somebody who has one will want this and where retyping 25 characters by
     hand invites a transcription error the check symbol would then reject.
     The paste target is the point, so the copy tells people what not to
     paste it into. */
  async function copy() {
    if (shown === null) return;
    try {
      await navigator.clipboard.writeText(shown);
      toast(m.rk_copied());
    } catch {
      toast(m.rk_failed());
    }
  }
</script>

<div class="screen">
  <ScreenHeader title={m.rk_title()} back="/settings/security" />

  {#if recoveryKeyPresence.known}
    {#if shown !== null}
      <!-- The one moment the characters exist. No back arrow out of this
           branch beyond the header's, and the primary action is the
           acknowledgement rather than anything that mints again. -->
      <div class="card">
        <h2 class="rk-shown-title">{m.rk_shown_title()}</h2>
        <p class="rk-key" data-recovery-key>{shown}</p>
        <p class="ob-text">{m.rk_shown_body()}</p>
        <p class="ob-text">{m.rk_shown_where()}</p>
        <div class="rk-actions">
          <button class="btn press" type="button" data-copy-recovery-key onclick={copy}>{m.rk_copy()}</button>
          <button
            class="btn press"
            type="button"
            data-print-recovery-key
            onclick={() => printCurrentPage(m.rk_title())}>{m.rk_print()}</button
          >
        </div>
        <button
          class="btn btn-primary"
          type="button"
          data-recovery-key-done
          onclick={() => {
            shown = null;
            toast(m.rk_made_toast());
          }}>{m.rk_done()}</button
        >
      </div>
    {:else if recoveryKeyPresence.exists}
      <div class="card">
        <p class="ob-text">{m.rk_active_body()}</p>
      </div>
      <ListCard>
        <ListRow
          key="replace-recovery-key"
          icon="key"
          title={m.rk_replace()}
          onclick={() => (confirming = 'replace')}
        />
        <ListRow
          key="remove-recovery-key"
          icon="trash"
          title={m.rk_revoke()}
          onclick={() => (confirming = 'revoke')}
        />
      </ListCard>
    {:else}
      <div class="card">
        <p class="ob-text">{m.rk_intro()}</p>
        <p class="ob-text">{m.rk_intro_cost()}</p>
      </div>
      <button class="btn btn-primary" type="button" data-make-recovery-key disabled={busy} onclick={mint}>
        {m.rk_make()}
      </button>
    {/if}
  {/if}
</div>

<Sheet
  open={confirming !== null}
  title={confirming === 'revoke' ? m.rk_revoke_title() : m.rk_replace_title()}
  onClose={() => (confirming = null)}
>
  <!-- No "takes effect at the next start" line here, and the reason is
       worth keeping: this branch shipped one, and it was false. Revoking
       removes the file and replacing overwrites it, so in both cases the old
       key stops opening the journal at once. What survives unchanged is the
       session already open, which holds the data key in memory and consults
       neither file again - and that is not what somebody at this confirm is
       asking about. The two bodies already say what stops working. -->
  <p class="ob-text">{confirming === 'revoke' ? m.rk_revoke_body() : m.rk_replace_body()}</p>
  {#if confirming === 'revoke'}
    <button class="btn btn-primary" type="button" data-confirm-revoke disabled={busy} onclick={revoke}>
      {m.rk_revoke_confirm()}
    </button>
  {:else}
    <button class="btn btn-primary" type="button" data-confirm-replace disabled={busy} onclick={mint}>
      {m.rk_replace_confirm()}
    </button>
  {/if}
</Sheet>

<style>
  /* Single-consumer classes live with their consumer (scripts/check-screens-classes.mjs). */
  .rk-shown-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-strong);
    margin: 0 0 var(--space-3);
  }

  /* The key itself, and the only place in the app where a string has to be
     read off a screen and copied by hand: monospace so a 0 and an O cannot
     be confused, wide letter spacing, and wrapping allowed at the hyphens
     rather than mid-group. */
  .rk-key {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-lg);
    letter-spacing: 0.08em;
    line-height: 1.7;
    margin: 0 0 var(--space-4);
    overflow-wrap: break-word;
    user-select: all;
  }

  .rk-actions {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .rk-actions .btn {
    flex: 1;
  }
</style>
