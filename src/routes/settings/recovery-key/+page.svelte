<script lang="ts">
  /* Recovery key settings distinguish missing, active, newly minted and
     pending confirmation (ADR-0054). Minting stores a second wrap.
     Confirmation makes it active and invalidates the old key. Leaving or
     reloading before confirmation leaves the new wrap pending. Finish by
     typing the new key, minting another, or keeping the old one.

     Only the wrap persists, so characters cannot be shown again after
     confirmation or leaving. On lock, recovery-key-held.ts can seal the
     key in memory and return it after unlock. */
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import {
    RecoveryKeyNotPendingError,
    discardPendingRecoveryKey,
    finishRecoveryKey,
    revokeRecoveryKey
  } from '$lib/data/recovery-key';
  import { RecoveryKeyMistypedError } from '$lib/crypto/recoveryKey';
  import { DecryptionFailedError } from '$lib/crypto/aesGcm';
  import { crossfade, resize } from '$lib/motion/reveal';
  import RecoveryKeyField from '$lib/components/RecoveryKeyField.svelte';
  import { recoveryKeyPresence, refreshRecoveryKeyPresence } from '$lib/data/recoveryKeyPresence.svelte';
  import { bootState, journalDataKey, prepareRecoveryKeyChange } from '$lib/stores/boot.svelte';
  import { isLockedNow } from '$lib/stores/lock.svelte';
  import {
    forgetHeldRecoveryKey,
    holdShownRecoveryKey,
    openHeldRecoveryKey,
    recoveryKeyHeld
  } from '$lib/data/recovery-key-held';
  import { onDestroy, tick } from 'svelte';
  import { focusArrivedScreen, focusNamedTarget } from '$lib/navigation/arrivalFocus';
  import { UnlockCancelledError } from '$lib/lock/unlock-attempt';
  import CurrentProtection from '$lib/components/CurrentProtection.svelte';
  import { copyRecoveryKey } from '$lib/data/recovery-key-clipboard';
  import { isAndroid } from '$lib/platform';
  import { printCurrentPage } from '$lib/print/print';
  import { toast } from '$lib/stores/toasts.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { leaveGuard } from '$lib/components/kit/leaveGuard.svelte';

  /** The minted key, present only between minting and leaving the screen.
      Never written anywhere; the copy that outlives a lock is sealed
      (data/recovery-key-held.ts). */
  let shown = $state<string | null>(null);
  let confirming = $state<'replace' | 'revoke' | null>(null);
  let busy = $state(false);
  /** Typing the new key to finish an interrupted replacement. */
  let finishing = $state(false);
  let typed = $state('');
  let finishError = $state('');
  let committing = $state(false);
  let step = $derived(
    shown !== null
      ? 'shown'
      : recoveryKeyPresence.pending
        ? finishing
          ? 'finishing'
          : 'unfinished'
        : recoveryKeyPresence.active
          ? 'active'
          : 'none'
  );
  let screen: HTMLElement;
  let focusAfterConfirmation = false;
  /* The last match, because a step that is leaving still fades out in front
     of the one arriving, and Svelte inserts the arriving one after it. */
  async function focusStep() {
    await tick();
    const target = step === 'finishing' ? '#rk-finish-key' : step === 'shown' || step === 'unfinished' ? '.rk-shown-title' : 'h1';
    const matches = screen.querySelectorAll<HTMLElement>(target);
    focusNamedTarget(matches[matches.length - 1]);
  }
  function focusCommittedStep() {
    if (confirming !== null) focusAfterConfirmation = true;
    else void focusStep();
  }

  /* Only the Android path marks the clip sensitive and takes it back, so
     only the Android path may promise either. */
  let android = $derived(isAndroid());

  refreshRecoveryKeyPresence();

  let protection = $state.raw<{ run: ReturnType<typeof prepareRecoveryKeyChange>; controller: AbortController } | null>(null);
  function cancelProtection() {
    protection?.controller.abort();
    protection = null;
  }
  onDestroy(cancelProtection);

  function mint() {
    if (busy || protection) return;
    const controller = new AbortController();
    const current = () => { if (controller.signal.aborted) throw new UnlockCancelledError(); };
    protection = {
      controller,
      run: prepareRecoveryKeyChange({ title: m.protection_title(), subtitle: m.protection_biometric_body(), cancel: m.cancel() }, current)
    };
    confirming = null;
  }

  async function authenticateMint(secret: string, current: () => void) {
    const operation = protection;
    if (!operation) throw new UnlockCancelledError();
    busy = true;
    try {
      const dataKey = await journalDataKey();
      const minted = await operation.run(secret, current);
      if (operation.controller.signal.aborted) return;
      holdShownRecoveryKey(minted, dataKey);
      shown = minted;
      finishing = false;
      focusAfterConfirmation = true;
      protection = null;
      await refreshRecoveryKeyPresence();
    } catch (error) {
      try {
        current();
        if (!operation.controller.signal.aborted) {
          protection = null;
          busy = false;
          mint();
        }
      } catch { /* The owner left while authentication or publication was pending. */ }
      throw error;
    } finally { busy = false; }
  }

  /* The commit. Finished with the characters on screen, so the wrap that
     becomes the key is the one these characters open and nothing else. A
     key already promoted by another tab counts as confirmed. A discarded
     or superseded key cannot confirm a different pending replacement. */
  async function confirmWritten() {
    if (busy || shown === null) return;
    busy = true;
    /* Acknowledged at the press: the person has said they have it, so a
       Back during the promotion leaves without asking again, and the
       promotion finishes behind them. */
    committing = true;
    try {
      await finishRecoveryKey(shown);
      await leaveShown(m.rk_made_toast());
    } catch (error) {
      if (error instanceof RecoveryKeyNotPendingError || error instanceof DecryptionFailedError) {
        await leaveShown(m.rk_not_waiting());
      } else {
        toast(m.rk_failed());
      }
    } finally {
      busy = false;
      committing = false;
    }
  }

  /* Presence first, so the screen goes from the key straight to the state
     after it rather than through the unfinished notice for a frame. */
  async function leaveShown(said: string) {
    guard.keep();
    forgetHeldRecoveryKey();
    await refreshRecoveryKeyPresence();
    shown = null;
    void focusStep();
    toast(said);
  }

  async function submitFinish(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    finishError = '';
    busy = true;
    try {
      await finishRecoveryKey(typed);
      await refreshRecoveryKeyPresence();
      typed = '';
      finishing = false;
      void focusStep();
      toast(m.rk_made_toast());
    } catch (error) {
      if (error instanceof RecoveryKeyNotPendingError) {
        await refreshRecoveryKeyPresence();
        typed = '';
        finishing = false;
        void focusStep();
        toast(m.rk_not_waiting());
        return;
      }
      finishError =
        error instanceof RecoveryKeyMistypedError
          ? m.rke_mistyped()
          : error instanceof DecryptionFailedError
            ? m.rk_finish_wrong()
            : m.rk_failed();
    } finally {
      busy = false;
    }
  }

  function openFinish() {
    finishing = true;
    finishError = '';
    void focusStep();
  }

  function closeFinish() {
    finishing = false;
    typed = '';
    void focusStep();
  }

  /* "Keep the old key", or for a first key that never finished, not having
     one: the waiting key goes and whatever was confirmed stays. */
  async function discard() {
    if (busy) return;
    busy = true;
    try {
      await discardPendingRecoveryKey();
      await refreshRecoveryKeyPresence();
      void focusStep();
      toast(m.rk_discarded_toast());
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
      focusCommittedStep();
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
     paste it into. What the clipboard itself costs, and what Android does
     about it, is data/recovery-key-clipboard.ts. */
  async function copy() {
    if (shown === null) return;
    try {
      await copyRecoveryKey(shown);
      toast(m.rk_copied());
    } catch {
      toast(m.rk_failed());
    }
  }

  /* The characters on screen are a draft of their own: shown once, gone
     on any departure. Leaving asks first (leaveGuard.ts); an unload gets
     the browser's own confirmation, because a sheet cannot wait across a
     reload, a closed tab or an external navigation. */
  const guard = leaveGuard({
    holding: () => shown !== null && !committing,
    onDiscard: () => {
      shown = null;
      forgetHeldRecoveryKey();
    }
  });

  /* A lock is the one departure that cannot ask: it unmounts this screen and used to take
     the only copy of the new key with it, at a time when minting had already killed the old
     one. A key the lock took before Done is shown again once the journal is open, and the
     screen waits for that answer before it draws anything, so it never says "a key is
     active" first and then swaps. Any other way off the screen has been through the guard
     above, and forgets it. Unlocking is not a navigation, so nothing else moves focus off
     the body; the returned key takes the arrival focus a navigation would have given the
     screen. A screen that is already gone when the answer comes (a second lock while it
     opened) takes nothing: the sealed copy stays for the next unlock, and the characters
     are not handed to a screen nobody can see. */
  let gone = false;
  let heldRead = $state(!recoveryKeyHeld());
  if (recoveryKeyHeld()) {
    journalDataKey()
      .then(openHeldRecoveryKey)
      .then((held) => {
        if (gone) return;
        shown = held;
        if (held !== null) focusArrivedScreen(document.getElementById('app-main'));
      })
      .catch((error) => {
        if (gone) return;
        console.error('could not open the recovery key held across the lock', error);
        forgetHeldRecoveryKey();
      })
      .finally(() => { heldRead = true; });
  }
  onDestroy(() => {
    gone = true;
    if (!isLockedNow(bootState.accessMode)) forgetHeldRecoveryKey();
  });

  /* Latched: a reserve must not put its placeholder back. */
  let presenceRevealed = $state(false);
  $effect.pre(() => {
    if (recoveryKeyPresence.known && heldRead) presenceRevealed = true;
  });
  const presenceEstimate = readReserve('recovery-key');
  const presenceRemember = (px: number) => rememberReserve('recovery-key', px);
</script>

<div class="screen" bind:this={screen}>
  <ScreenHeader title={m.rk_title()} back="/settings/security" />

  <!-- Held until the key's presence is known, then faded in: a cold open reads it after the first paint, and the panel
       cut in at full opacity when it came back. A key held across a lock
       reserves nothing: it opens within the screen's first frame, and a
       placeholder there only flashed and faded out over the key. -->
  <ReadReserve ready={presenceRevealed} estimate={heldRead ? presenceEstimate : 0} onrest={presenceRemember}>
  {#if recoveryKeyPresence.known}
    <!-- One step at a time, crossfading in place while the box travels to the new height:
         the old step fades out of flow under the new one, which fades up where it rests.
         Mounted with the reserve's own fade the first time, so only a change plays this. -->
    <div class="rk-steps" use:resize>
    {#key step}
    <div class="screen-part" transition:crossfade data-recovery-key-step={step}>
    {#if step === 'shown'}
      <!-- The one moment the characters exist. No back arrow out of this
           branch beyond the header's, and the primary action is the
           acknowledgement rather than anything that mints again. -->
      <div class="kit-panel" data-kit-surface>
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
            onclick={() => printCurrentPage(m.rk_title())}>{m.print()}</button
          >
        </div>
        {#if android}
          <p class="rk-copy-note" data-recovery-key-copy-note>{m.rk_copy_clears_android()}</p>
        {/if}
        <button
          class="btn btn-primary"
          type="button"
          data-recovery-key-done
          disabled={busy}
          onclick={confirmWritten}>{m.rk_done()}</button
        >
      </div>
    {:else if step === 'unfinished' || step === 'finishing'}
      <!-- An interrupted replacement or first key: the one notice, then its three choices,
           or the field that finishes. -->
      <div class="kit-panel" data-kit-surface data-recovery-key-unfinished>
        <h2 class="rk-shown-title">
          {recoveryKeyPresence.active ? m.rk_unfinished_replace_title() : m.rk_unfinished_make_title()}
        </h2>
        <p class="ob-text">
          {recoveryKeyPresence.active ? m.rk_unfinished_replace_body() : m.rk_unfinished_make_body()}
        </p>
      </div>
      {#if step === 'finishing'}
        <form class="rk-finish" onsubmit={submitFinish} data-recovery-key-finish>
          <p class="ob-text">{m.rke_body()}</p>
          <RecoveryKeyField id="rk-finish-key" label={m.rk_finish_label()} bind:value={typed} disabled={busy} />
          <p class="pin-status small" role="alert" data-recovery-key-finish-error>{finishError}</p>
          <div class="rk-finish-actions">
            <button class="btn btn-primary" type="submit" data-submit-finish-recovery-key disabled={busy}>
              {m.rk_finish_submit()}
            </button>
            <button class="btn btn-ghost" type="button" data-cancel-finish-recovery-key disabled={busy} onclick={closeFinish}>
              {m.cancel()}
            </button>
          </div>
        </form>
      {:else}
        <ListCard>
          <ListRow key="finish-recovery-key" icon="key" title={m.rk_unfinished_have()} onclick={openFinish} />
          <ListRow key="make-another-recovery-key" icon="repeat" title={m.rk_unfinished_another()} onclick={mint} />
          <ListRow
            key="discard-pending-recovery-key"
            icon="x"
            title={recoveryKeyPresence.active ? m.rk_unfinished_keep_old() : m.rk_unfinished_discard()}
            onclick={discard}
          />
        </ListCard>
      {/if}
    {:else if step === 'active'}
      <div class="kit-panel" data-kit-surface>
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
      <div class="kit-panel rk-before-make" data-kit-surface>
        <p class="ob-text">{m.rk_intro()}</p>
        <p class="ob-text">{m.rk_intro_cost()}</p>
      </div>
      <button class="btn btn-primary" type="button" data-make-recovery-key disabled={busy} onclick={mint}>
        {m.rk_make()}
      </button>
    {/if}
    </div>
    {/key}
    </div>
  {/if}
  </ReadReserve>
</div>

<Sheet
  open={confirming !== null}
  title={confirming === 'revoke' ? m.rk_revoke_title() : m.rk_replace_title()}
  onClose={() => (confirming = null)}
  onClosed={() => {
    if (!focusAfterConfirmation) return;
    focusAfterConfirmation = false;
    void focusStep();
  }}
>
  <!-- No "takes effect at the next start" line here, and the reason is worth keeping: this
       branch shipped one, and it was false. Revoking removes the file at once, and
       replacing kills the old key the moment the new one is confirmed. What survives
       unchanged is the session already open, which holds the data key in memory and
       consults neither file again - and that is not what somebody at this confirm is asking
       about. The two bodies already say what stops working, and what does not: the data key
       is not rotated, so a copy of the journal's files taken earlier still opens with the
       old key. -->
  <p class="ob-text">{confirming === 'revoke' ? m.rk_revoke_body() : m.rk_replace_body()}</p>
  <!-- Danger, with a way back: both confirms lead to the written key no
       longer opening the journal, and the sheet used to offer them as the
       primary action with only a drag or the scrim to say no. -->
  <div class="stack-3" style="margin-top:var(--space-4)">
    {#if confirming === 'revoke'}
      <button class="btn btn-danger" type="button" data-confirm-revoke disabled={busy} onclick={revoke}>
        {m.rk_revoke_confirm()}
      </button>
    {:else}
      <button class="btn btn-danger" type="button" data-confirm-replace disabled={busy} onclick={mint}>
        {m.rk_replace_confirm()}
      </button>
    {/if}
    <button class="btn btn-ghost" type="button" data-cancel-recovery-key disabled={busy} onclick={() => (confirming = null)}>
      {m.cancel()}
    </button>
  </div>
</Sheet>

<Sheet
  open={protection !== null}
  title={m.protection_title()}
  onClose={cancelProtection}
  onClosed={() => {
    if (!focusAfterConfirmation) return;
    focusAfterConfirmation = false;
    void focusStep();
  }}
>
  {#if protection !== null}
    <CurrentProtection mode={bootState.accessMode} allowRecovery={recoveryKeyPresence.exists} onVerify={authenticateMint} onCancel={cancelProtection} />
  {/if}
</Sheet>

<Sheet
  open={guard.pendingDeparture !== null}
  title={m.rk_leave_title()}
  onClose={guard.keep}
>
  <p class="ob-text">{m.rk_leave_body()}</p>
  <div class="rk-departure-actions">
    <button
      class="btn btn-primary"
      type="button"
      data-keep-writing-recovery-key
      onclick={guard.keep}
    >
      {m.rk_keep_writing()}
    </button>
    <button class="btn btn-danger" type="button" data-leave-recovery-key onclick={guard.discard}>
      {m.rk_leave()}
    </button>
  </div>
</Sheet>

<style>
  /* The make button follows this panel with no gap, so the panel's bottom
     hairline ran along the button's top edge and read as part of it.
     The button closes the panel instead. */
  .rk-before-make { border-bottom: 0; }

  /* Single-consumer classes live with their consumer (scripts/check-screens-classes.mjs). */
  .rk-shown-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
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

  /* A footnote to the two buttons above it rather than another paragraph of
     the screen's body, which is why it is smaller and sits tight under
     them. */
  .rk-copy-note {
    color: var(--text-2);
    font-size: var(--text-sm);
    line-height: 1.5;
    margin: 0 0 var(--space-4);
  }

  /* An outgoing step fades out of flow (motion/reveal.ts, crossfade), so
     the box it leaves has to be the one it is positioned in. */
  .rk-steps {
    position: relative;
  }

  .rk-finish-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .rk-departure-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
</style>
