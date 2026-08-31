<script lang="ts">
  /* Changing how the journal opens, later (ticket 53). The same module the
     first run uses, so there is one place that explains the three modes and
     one place that can be got wrong.

     Every direction is a rewrap of the same data key (crypto/keystore.ts):
     the journal is not re-encrypted, so the change is instant whatever the
     journal's size, and an interrupted one loses nothing - boot prefers a
     secret keystore over leftover device-bound material, so a crash mid
     change leaves a journal that still opens under one mode or the other.

     Changing the secret *within* a mode is a different job and is not here:
     that is /settings/passphrase for a passphrase and the PIN row below for
     a PIN, both of which need the current secret and this screen does not. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { bootState, changeAccessMode } from '$lib/stores/boot.svelte';
  import { changeJournalPassphrase, MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import { changeJournalPin, unlockJournalPin } from '$lib/data/journal-pin';
  import { DeviceBindingUnavailableError } from '$lib/data/device-secret';
  import { toast } from '$lib/stores/toasts.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import AccessModeSetup from '$lib/components/AccessModeSetup.svelte';
  import PinPad from '$lib/components/PinPad.svelte';
  import PinEntry, { type PinAttempt } from '$lib/components/PinEntry.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';

  type Mode = 'device-bound' | 'pin' | 'passphrase';

  let busy = $state(false);
  let error = $state('');
  /** The change-my-PIN flow, which is not a change of mode and so is not the
      module's job: it needs the current PIN before it can rewrap. */
  let changingPin = $state(false);
  let currentPin = $state('');
  let nextPin = $state('');
  let heldPin = $state('');
  let pinRefusals = $state(0);

  let current = $derived(
    bootState.accessMode === 'pin' || bootState.accessMode === 'passphrase' || bootState.accessMode === 'device-bound'
      ? (bootState.accessMode as Mode)
      : null
  );

  async function choose(mode: Mode, secret: string) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await changeAccessMode(mode, secret);
      toast(m.am_changed_toast());
      await goto('/settings/security');
    } catch (e) {
      console.error('changing the access mode failed', e);
      error = m.am_change_failed();
    } finally {
      busy = false;
    }
  }

  /* Two steps, and the first one is a gate like any other. It goes through
     PinEntry so the current PIN is throttled and a lost device key gets its
     own sentence - this screen checked it by hand at first, which meant the
     one place in the app where a wrong PIN cost nothing and a missing device
     key read as a wrong PIN. Both real gates already got that right; this is
     now the same component they use.

     Verifying by unlocking rather than by a comparison: there is nothing to
     compare against, and a PIN that opens the keystore is the definition of
     the current one. */
  async function verifyCurrentPin(entered: string): Promise<PinAttempt> {
    try {
      await unlockJournalPin(entered);
      currentPin = entered;
      return 'ok';
    } catch (e) {
      return e instanceof DeviceBindingUnavailableError ? 'device-gone' : 'wrong';
    }
  }

  /** The new PIN, twice. Nothing is being guessed at here, so the bare pad. */
  async function chooseNewPin(entered: string) {
    error = '';
    if (heldPin === '') {
      heldPin = entered;
      nextPin = '';
      return;
    }
    if (entered !== heldPin) {
      error = m.pin_mismatch();
      pinRefusals++;
      heldPin = '';
      nextPin = '';
      return;
    }

    busy = true;
    try {
      await changeJournalPin(currentPin, entered);
      toast(m.pin_changed_toast());
      await goto('/settings/security');
    } catch (e) {
      console.error('changing the PIN failed', e);
      error = m.am_change_failed();
      heldPin = '';
      nextPin = '';
    } finally {
      busy = false;
    }
  }

  let pinPrompt = $derived(
    currentPin === '' ? m.pin_change_current() : heldPin === '' ? m.pin_choose_title() : m.pin_again_title()
  );
</script>

<div class="screen">
  <ScreenHeader title={m.am_change_title()} back="/settings/security" />

  {#if changingPin}
    <div class="card">
      <p class="ob-text">{pinPrompt}</p>
      {#if currentPin === ''}
        <PinEntry onVerify={verifyCurrentPin} />
      {:else}
        <PinPad bind:value={nextPin} disabled={busy} refusals={pinRefusals} onComplete={chooseNewPin} />
        <p class="pin-status small" role="alert" data-access-status>{error}</p>
      {/if}
      <button
        class="btn btn-ghost"
        disabled={busy}
        onclick={() => {
          changingPin = false;
          currentPin = '';
          heldPin = '';
          nextPin = '';
          error = '';
        }}
      >
        <span>{m.not_now()}</span>
      </button>
    </div>
  {:else}
    <div class="card">
      <AccessModeSetup purpose="change" {current} {busy} {error} onChoose={choose} />
    </div>

    <!-- Changing the secret without changing the mode. Two rows rather than
         one, because only one of them applies at a time and a disabled row
         explaining why would be a third thing to read. -->
    <ListCard>
      {#if current === 'passphrase'}
        <ListRow
          key="change-passphrase"
          icon="shield"
          title={m.pp_change_title()}
          subtitle={m.pp_change_sub({ min: String(MIN_PASSPHRASE_LENGTH) })}
          href="/settings/passphrase"
        />
      {/if}
      {#if current === 'pin'}
        <ListRow
          key="change-pin"
          icon="lock"
          title={m.pin_change_title()}
          subtitle={m.pin_change_sub()}
          onclick={() => (changingPin = true)}
        />
      {/if}
    </ListCard>
  {/if}
</div>
