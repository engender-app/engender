<script module lang="ts">
  /* The chosen mode's name, exported so a gate or a settings screen can put
     it in its own heading rather than leaving a question over a screen that
     has already answered it. Reads the platform itself, because device-bound
     is the one whose name differs. */
  import { m as messages } from '$lib/paraglide/messages';
  import { isAndroid as onAndroid } from '$lib/platform';
  import { PIN_LENGTH as PIN_DIGITS } from '$lib/crypto/params';

  export type AccessSetupMode = 'device-bound' | 'pin' | 'passphrase';

  export function accessModeTitle(mode: AccessSetupMode): string {
    if (mode === 'passphrase') return messages.am_mode_passphrase();
    if (mode === 'pin') return messages.am_mode_pin({ digits: String(PIN_DIGITS) });
    return onAndroid() ? messages.am_mode_device_android() : messages.am_mode_device_web();
  }
</script>

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

  type Mode = AccessSetupMode;

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
    onChoose,
    chosen = $bindable(null)
  }: {
    purpose?: 'setup' | 'change';
    current?: Mode | null;
    busy?: boolean;
    error?: string;
    /** The secret is empty for device-bound mode, which has none. */
    onChoose: (mode: Mode, secret: string) => void;
    /** Which row is open, readable by whoever mounted this so their own
        heading can name it. */
    chosen?: Mode | null;
  } = $props();

  let android = $derived(isAndroid());

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

  const title = accessModeTitle;

  function subtitle(mode: Mode): string {
    if (mode === 'passphrase') return m.am_mode_passphrase_sub();
    if (mode === 'pin') return m.am_mode_pin_sub();
    return android ? m.am_mode_device_sub_android() : m.am_mode_device_sub_web();
  }

  /* Three modes, three glyphs, on both platforms. Device-bound was drawn
     with the same padlock as the PIN at first, which made two of the three
     rows indistinguishable at a glance - the one thing a list of choices
     cannot afford. A key is also the truer picture of it: something held for
     you rather than something you know. */
  function icon(mode: Mode): string {
    if (mode === 'passphrase') return 'shield';
    if (mode === 'pin') return 'lock';
    return android ? 'fingerprint' : 'key';
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
         above the control that makes it. Left-aligned, for the reason
         .gate-body.is-long exists: this is four or five lines of prose whose
         whole job is being read once and understood, and centred prose goes
         ragged at both edges. It was centred in the first build of this
         screen, which is what the render caught.

         Neutral rather than the danger surface. Every mode here has a
         consequence, this is the one the person just chose, and dressing a
         chosen option in the colour of an error says they got it wrong. The
         words carry the weight - docs/ui-copy.md's rule for the risk screens
         is that the sentence is as final as the behaviour, not that the box
         is red. -->
    <div class="am-notice">
      <span class="am-notice-ico"><Icon name={tiedToDevice(chosen) ? 'alert' : 'shield'} size={20} /></span>
      <p>{consequence(chosen)}</p>
    </div>

    {#if tiedToDevice(chosen)}
      <!-- Said once, next to both modes it is true of, because it is the
           one sentence that turns "tied to this device" into something a
           person can act on. -->
      <p class="am-export-note gate-body is-long is-small" data-access-export-note>{m.am_export_note()}</p>
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
      <!-- Only which of the two entries this is. What a PIN costs and buys is
           above, said once; repeating pin_setup_body here put the same three
           facts on the screen twice and pushed the pad below the fold. -->
      <p class="gate-body" data-access-pin-step>
        {confirmingPin ? m.pin_confirm_body() : m.am_pin_choose()}
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

<style>
  /* The module's own notice surface: one outline, an icon, and as many lines
     as the consequence being stated actually needs. Local rather than in
     screens.css because this is its only consumer
     (scripts/check-screens-classes.mjs enforces that), and named for the
     module rather than the gate frame because it appears inside a settings
     card too.

     It replaces .gate-modes, the passphrase gate's old "here are your
     options" block. The options are rows now; what this carries is one
     mode's consequence.

     Left-aligned, for the same reason .gate-body.is-long is: four or five
     lines of prose that has to be read once and understood does not go in a
     centred column, and the gate frame centres everything by default. The
     first build of this screen inherited that centring, which is what
     looking at the render caught. */
  .am-notice {
    display: flex;
    gap: var(--space-3);
    text-align: left;
    margin-top: var(--space-4);
    padding: var(--space-4);
    border: 1px solid var(--outline-strong);
    border-radius: var(--r-card);
  }

  .am-notice-ico {
    color: var(--accent-ink);
    flex: none;
  }

  .am-notice p {
    color: var(--text-2);
    font-size: var(--text-sm);
    margin: 0;
  }

  /* The notice carries its own top margin and this line followed it with
     none, so the two ran together into one block of text. */
  .am-export-note {
    margin-top: var(--space-3);
  }
</style>
