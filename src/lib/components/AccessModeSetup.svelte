<script lang="ts">
  /* One security module, three named choices (ticket 53, ADR-0041).

     What a person used to meet was three disconnected things at three
     moments: a passphrase gate that looked mandatory but hid a "Skip" into
     device-bound mode, a PIN toggle buried in onboarding that encrypted
     nothing, and on Android a biometric prompt that just happened. This is
     all of it, once, as a choice between equals - and it is the same
     component in both places it appears, the first run (ticket 54 wires it
     there) and Settings.

     No "Skip" anywhere. Device-bound mode is a row like the others, with its
     trade written next to it rather than behind an acknowledgement
     checkbox.

     Three rows, not four. ADR-0041's fourth mode is the web's WebAuthn PRF
     biometric, which ticket 55 owns; on Android the biometric is not a
     fourth thing at all but what device-bound mode already does, so the row
     says so instead of offering a second mechanism (its Keystore key is not
     released until the platform confirms who is present, whatever
     `bioOptIn` says).

     Copy rule for this screen, and it is the strict one (docs/ui-copy.md,
     "The screens that carry risk"): every mode states its own consequence
     before it is chosen, not after. Two of the three tie the journal to this
     device, and for those the archive is the only thing that survives losing
     it - so that sentence sits under the choice rather than in a help page
     nobody opens. */

  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import { PIN_LENGTH } from '$lib/crypto/params';
  import { MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import { isValidPin } from '$lib/data/journal-pin';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import PinPad from './PinPad.svelte';
  import Icon from './Icon.svelte';

  type Mode = 'device-bound' | 'pin' | 'passphrase';

  let {
    /** `setup` is a first run with no journal yet; `change` already has one
        open and is rewrapping the same data key. The difference is which
        modes can be offered and what the primary button says, not how the
        choice is presented. */
    purpose = 'setup',
    /** The mode this journal is on now, so `change` can mark it and leave it
        out of the list of things to move to. */
    current = null,
    busy = false,
    error = '',
    onChoose
  }: {
    purpose?: 'setup' | 'change';
    current?: Mode | null;
    busy?: boolean;
    error?: string;
    /** The secret is empty for device-bound mode, which has none. */
    onChoose: (mode: Mode, secret: string) => void;
  } = $props();

  let android = $derived(isAndroid());
  let chosen = $state<Mode | null>(null);

  let passphrase = $state('');
  let confirmation = $state('');
  let pin = $state('');
  let chosenPin = $state('');
  let localError = $state('');
  let refusals = $state(0);

  let confirmingPin = $derived(chosenPin !== '');

  /* Android's Keystore bridge mints its own data key and cannot be asked to
     wrap one that already exists, so moving an open journal to device-bound
     mode there would mean re-encrypting the whole thing. Out of scope, and
     named rather than silently missing: the row is absent on a change, and
     ticket 53's notes carry it as the follow-up. */
  let modes = $derived(
    (['device-bound', 'pin', 'passphrase'] as Mode[]).filter((mode) => {
      if (mode === current) return false;
      return !(mode === 'device-bound' && purpose === 'change' && android);
    })
  );

  function title(mode: Mode): string {
    if (mode === 'passphrase') return m.am_mode_passphrase();
    if (mode === 'pin') return m.am_mode_pin({ digits: String(PIN_LENGTH) });
    return android ? m.am_mode_device_android() : m.am_mode_device_web();
  }

  function subtitle(mode: Mode): string {
    if (mode === 'passphrase') return m.am_mode_passphrase_sub();
    if (mode === 'pin') return m.am_mode_pin_sub();
    return android ? m.am_mode_device_sub_android() : m.am_mode_device_sub_web();
  }

  function icon(mode: Mode): string {
    if (mode === 'passphrase') return 'shield';
    if (mode === 'pin') return 'lock';
    return android ? 'fingerprint' : 'lock';
  }

  /** The whole consequence, stated before the mode is chosen. */
  function consequence(mode: Mode): string {
    if (mode === 'passphrase') return m.am_passphrase_detail({ min: String(MIN_PASSPHRASE_LENGTH) });
    if (mode === 'pin') return m.am_pin_detail({ digits: String(PIN_LENGTH) });
    return android ? m.am_device_detail_android() : m.am_device_detail_web();
  }

  /** True where losing this device loses the journal, which is what makes the
      export line worth saying here rather than in a help page. */
  function tiedToDevice(mode: Mode): boolean {
    return mode !== 'passphrase';
  }

  function back() {
    chosen = null;
    passphrase = '';
    confirmation = '';
    pin = '';
    chosenPin = '';
    localError = '';
  }

  function submitPassphrase(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    localError = '';
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      localError = m.pp_too_short({ min: String(MIN_PASSPHRASE_LENGTH) });
      return;
    }
    if (passphrase !== confirmation) {
      localError = m.pp_mismatch();
      return;
    }
    onChoose('passphrase', passphrase);
  }

  function completePin(entered: string) {
    localError = '';
    if (!confirmingPin) {
      chosenPin = entered;
      pin = '';
      return;
    }
    if (entered !== chosenPin) {
      localError = m.pin_mismatch();
      refusals++;
      chosenPin = '';
      pin = '';
      return;
    }
    if (!isValidPin(entered)) {
      localError = m.pin_mismatch();
      pin = '';
      return;
    }
    onChoose('pin', entered);
  }

  let shownError = $derived(error || localError);
</script>

{#if chosen === null}
  <div class="am-intro">
    <p class="gate-body is-long" data-access-intro>
      {purpose === 'change' ? m.am_change_body() : m.am_setup_body()}
    </p>
  </div>

  <div class="am-modes" data-access-modes>
    <ListCard>
      {#each modes as mode (mode)}
        <ListRow
          key={mode}
          icon={icon(mode)}
          title={title(mode)}
          subtitle={subtitle(mode)}
          onclick={() => (chosen = mode)}
        />
      {/each}
    </ListCard>
  </div>

  {#if current !== null}
    <p class="gate-note" data-access-current>{m.am_current({ mode: title(current) })}</p>
  {/if}
{:else}
  <div class="am-chosen" data-access-chosen={chosen}>
    <!-- The consequence, on the screen where the choice is actually made and
         above the field that makes it. -->
    <div class="notice" class:notice-danger={tiedToDevice(chosen)}>
      <Icon name={tiedToDevice(chosen) ? 'alert' : 'shield'} size={20} />
      <div class="notice-body">
        <span class="notice-title">{title(chosen)}</span>
        {consequence(chosen)}
      </div>
    </div>

    {#if tiedToDevice(chosen)}
      <p class="gate-note" data-access-export-note>{m.am_export_note()}</p>
    {/if}

    {#if chosen === 'passphrase'}
      <form class="gate-form" onsubmit={submitPassphrase}>
        <div>
          <label class="field-label" for="am-passphrase">{m.pp_label_setup()}</label>
          <input
            class="input"
            type="password"
            id="am-passphrase"
            name="passphrase"
            autocomplete="new-password"
            bind:value={passphrase}
            disabled={busy}
          />
        </div>
        <div>
          <label class="field-label" for="am-passphrase-confirm">{m.pp_label_confirm()}</label>
          <input
            class="input"
            type="password"
            id="am-passphrase-confirm"
            name="confirmation"
            autocomplete="new-password"
            bind:value={confirmation}
            disabled={busy}
          />
        </div>
        <p class="pin-status small" role="alert" data-access-status>{shownError}</p>
        <button class="btn btn-primary" type="submit" data-access-submit disabled={busy}>
          <span>{busy ? m.pp_encrypting() : m.am_confirm_passphrase()}</span>
        </button>
      </form>
    {:else if chosen === 'pin'}
      <p class="gate-body" data-access-pin-step>
        {confirmingPin ? m.pin_confirm_body() : m.pin_setup_body()}
      </p>
      <PinPad bind:value={pin} disabled={busy} {refusals} onComplete={completePin} />
      <p class="pin-status small" role="alert" data-access-status>{shownError}</p>
    {:else}
      <div class="gate-actions">
        <button class="btn btn-primary" data-access-submit disabled={busy} onclick={() => onChoose('device-bound', '')}>
          <span>{busy ? m.pp_encrypting() : m.am_confirm_device()}</span>
        </button>
      </div>
      <p class="pin-status small" role="alert" data-access-status>{shownError}</p>
    {/if}

    <div class="gate-foot">
      <button class="btn btn-ghost" data-access-back disabled={busy} onclick={back}>
        <span>{m.am_pick_another()}</span>
      </button>
    </div>
  </div>
{/if}
