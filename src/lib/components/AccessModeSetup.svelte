<script module lang="ts">
  /* The chosen mode's name, exported so a gate or a settings screen can put
     it in its own heading rather than leaving a question over a screen that
     has already answered it. Reads the platform itself, because device-bound
     is the one whose name differs. */
  import { m as messages } from '$lib/paraglide/messages';
  import { isAndroid as onAndroid } from '$lib/platform';
  import { PIN_LENGTH as PIN_DIGITS } from '$lib/crypto/params';
  import type { AccessModeSetupResult } from '$lib/stores/boot.svelte';
  import type { AccessSetupMode } from './accessModeSetup.ts';

  export type { AccessSetupMode };

  export function accessModeTitle(mode: AccessSetupMode): string {
    if (mode === 'passphrase') return messages.am_mode_passphrase();
    if (mode === 'pin') return messages.am_mode_pin({ digits: String(PIN_DIGITS) });
    if (mode === 'biometric') return messages.am_mode_biometric();
    /* The web's device-bound mode is named for what it is to the person:
       the key sits in the browser and nothing is asked, which is Android's
       unlocked mode by another mechanism, so it carries that name. */
    if (mode === 'unlocked' || !onAndroid()) return messages.am_mode_unlocked();
    return messages.am_mode_device_android();
  }

  /** The sentence for every outcome of submitAccessModeSetup() besides 'ok'
      (boot.svelte.ts), exported for the same reason accessModeTitle is:
      onboarding's lock step and JournalGate both hand the module a chosen
      mode and both need the same answer for what came back, so the mapping
      lives here once rather than as a matching if/else chain in each. */
  export function accessModeSetupErrorMessage(result: Exclude<AccessModeSetupResult, 'ok'>): string {
    if (result === 'needs-device-lock') return messages.am_device_no_lock();
    if (result === 'device-bound-unavailable') return messages.am_device_unavailable();
    /* A device that will not release a biometric secret has not failed at
       setup, it has answered that it cannot do this mode - so the sentence
       sends the person to another row rather than inviting a retry at a
       wall. */
    if (result === 'biometric-unavailable') return messages.am_biometric_unavailable();
    return messages.am_setup_failed();
  }
</script>

<script lang="ts">
  /* Onboarding and Settings share access mode choices (ADR-0041).
     Device-bound has its own row. Android's device-bound key already uses
     platform presence through Keystore. Web offers WebAuthn PRF only after
     the browser confirms support.

     State each mode's consequences before selection.
     For device-tied modes, explain the value of an archive if the device
     is lost. */

  import { onMount } from 'svelte';
  import { focusNamedTarget } from '$lib/navigation/arrivalFocus';
  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import { PIN_LENGTH } from '$lib/crypto/params';
  import { prfAvailable } from '$lib/data/webauthn-prf';
  import { fieldPart } from '$lib/motion/navigation';
  import { MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import {
    backToDetail,
    backToList,
    chooseMode,
    continueToSecret,
    needsSecret,
    type AccessModeScreen
  } from './accessModeSetup.ts';
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
    /** `recovered` is a change with two differences that both showed up in
        a render (ADR-0054, ticket sec-02). The screen holding it already
        carries its own paragraph saying what happened, so a second one
        about rewrapping is a wall of explanation nobody reads; and the mode
        it names as current is the one that just failed, which above a list
        of alternatives reads as a reassurance that it still works. So this
        purpose draws neither. It is otherwise a change in every way that
        matters, including which modes are offered. */
    purpose?: 'setup' | 'change' | 'recovered';
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
  /* Which mode the parent's `error` answers. The parent owns that text and
     keeps it until its next attempt, so without this a refusal of one mode
     ("needs a device lock") sat under the next mode's form. Choosing again, or going back, lets go of it here. */
  let attempted = $state<Mode | null>(null);

  function submit(mode: Mode, secret: string) {
    attempted = mode;
    onChoose(mode, secret);
  }
  let refusals = $state(0);

  /* The two screens, as one state machine: accessModeSetup.ts
     decides what the next screen is, this only ever holds what it returns. */
  let screen = $state<AccessModeScreen>({ screen: 'list' });

  let confirmingPin = $derived(chosenPin !== '');
  let stepTitle = $derived(screen.screen === 'list'
    ? (purpose === 'setup' ? m.am_setup_title() : m.am_change_title())
    : screen.screen === 'secret' && screen.mode === 'pin'
      ? (confirmingPin ? m.pin_again_title() : m.pin_choose_title())
      : accessModeTitle(screen.mode));

  /* Asked of the browser once, when the module mounts, because the answer
     needs an await and a row cannot wait for one. False until it comes back,
     so the list never flashes a mode the device turns out not to have; the
     other three are there from the first frame either way.

     Android is excluded here rather than inside prfAvailable(): the phone's
     biometric is device-bound mode's Keystore gate (ADR-0041), so a second
     row would be two names for one mechanism even on a WebView that happens
     to answer yes. */
  let biometricOffered = $state(false);
  onMount(async () => {
    biometricOffered = !isAndroid() && (await prfAvailable());
  });

  /* On Android, the native Keystore bridge wraps an existing data key for
     both 'device-bound' (gated by lock screen) and 'unlocked' (hardware key,
     no prompt), so both can be selected on setup and on change without
     re-encrypting the journal. On the web, 'device-bound' is
     the ungated mode. */
  let candidateModes: Mode[] = $derived(
    android
      ? ['device-bound', 'unlocked', 'pin', 'passphrase']
      : ['device-bound', 'biometric', 'pin', 'passphrase']
  );

  let modes = $derived(
    candidateModes.filter((mode) => {
      if (mode === current) return false;
      if (mode === 'biometric' && !biometricOffered) return false;
      return true;
    })
  );

  const title = accessModeTitle;

  function subtitle(mode: Mode): string {
    if (mode === 'passphrase') return m.am_mode_passphrase_sub();
    if (mode === 'pin') return m.am_mode_pin_sub();
    if (mode === 'biometric') return m.am_mode_biometric_sub();
    if (mode === 'unlocked' || !android) return m.am_mode_unlocked_sub();
    return m.am_mode_device_sub_android();
  }

  /* A glyph per mode, on every platform. Device-bound was drawn with the
     same padlock as the PIN at first, which made two rows indistinguishable
     at a glance - the one thing a list of choices cannot afford. A key is
     also the truer picture of it: something held for you rather than
     something you know. */
  function icon(mode: Mode): string {
    if (mode === 'passphrase') return 'shield';
    if (mode === 'pin') return 'lock';
    /* The fingerprint belongs to whichever mode is actually gated by the
       platform's own check, and only one of them ever is on a given
       platform: device-bound on Android, biometric on the web. */
    if (mode === 'biometric') return 'fingerprint';
    if (mode === 'unlocked') return 'unlock';
    return android ? 'fingerprint' : 'key';
  }

  /** The whole consequence, stated before the mode is chosen. */
  function consequence(mode: Mode): string {
    if (mode === 'passphrase') return m.am_passphrase_detail({ min: String(MIN_PASSPHRASE_LENGTH) });
    /* Split by platform, because the attacker who gets both halves differs.
       PIN mode's binding key lives in the same store device-bound mode's key
       does, so on the web a copy of the whole browser profile takes the
       device half as well - a far cheaper act than taking a phone apart, and
       the first draft of this copy did not say so. */
    if (mode === 'pin') return android ? m.am_pin_detail_android() : m.am_pin_detail_web();
    if (mode === 'biometric') return m.am_biometric_detail();
    if (mode === 'unlocked') return m.am_unlocked_detail();
    return android ? m.am_device_detail_android() : m.am_device_detail_web();
  }

  /** True where losing this device loses the journal, which is what makes the
      export line worth saying here rather than in a help page. */
  function tiedToDevice(mode: Mode): boolean {
    return mode !== 'passphrase';
  }

  /** A row picked off the bare list: its detail screen, whatever it costs
      and whether or not it has a secret to type next. */
  function select(mode: Mode) {
    screen = chooseMode(mode);
    chosen = mode;
    attempted = null;
  }

  /** Screen one to screen two, for the two modes that have something to
      type. Nothing to reset here: the secret fields are already empty,
      whatever put this mode's detail screen up. */
  function proceed() {
    screen = continueToSecret(screen);
  }

  /** Whatever has been typed so far, on either secret field - shared by both
      ways back off the secret screen, which throw the attempt away rather
      than carry any of it to wherever they land. */
  function resetSecretFields() {
    passphrase = '';
    confirmation = '';
    pin = '';
    chosenPin = '';
    localError = '';
    attempted = null;
  }

  /** Screen two back to screen one, the mode still chosen - only
      the typed-so-far secret is thrown away, not the choice that led here. */
  /** Delegate setup's external Back to the same controls this module draws. */
  export function back(): void {
    if (busy) return;
    if (screen.screen === 'secret') backFromSecret();
    else if (screen.screen === 'detail') pickAnother();
  }

  function backFromSecret() {
    screen = backToDetail(screen);
    resetSecretFields();
  }

  /** "Pick another way": the detail screen back to the bare list. */
  function pickAnother() {
    screen = backToList();
    chosen = null;
    resetSecretFields();
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
    submit('passphrase', passphrase);
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
    submit('pin', entered);
  }

  let shownError = $derived(
    (screen.screen !== 'list' && screen.mode === attempted ? error : '') || localError
  );
</script>

<!-- One step in three states, and a state change moves. The
     module's screens used to swap in a single frame: the four modes were
     there and then the chosen one's consequence was, with nothing in
     between - "a mode picked inside the gate, yank between frame 1 and 2"
     (Alicja, round one on redesign ticket 34). They cross now, on the same
     crossfade setup's own steps take, over a grid cell that holds both so
     the two overlap rather than stacking and doubling the page's height
     while they do. The field's edge is already travelling underneath, since
     the gate's title changes with the screen. -->
<div class="am-stage">
  {#key screen.screen}
    <div class="am-stage-screen" in:fieldPart out:fieldPart onintroend={(event) => {
      if (document.activeElement === document.body || document.activeElement?.closest('[inert]'))
        focusNamedTarget(event.currentTarget.querySelector<HTMLElement>('[data-access-step-heading]'));
    }}>
      {#key stepTitle}
        <h2 class="visually-hidden" data-access-step-heading {@attach focusNamedTarget}>{stepTitle}</h2>
      {/key}
{#if screen.screen === 'list'}
  {#if purpose !== 'recovered'}
    <div class="am-intro">
      <p class="gate-body" data-access-intro>
        {purpose === 'change' ? m.am_change_body() : m.am_setup_body()}
      </p>
    </div>
  {/if}

  <div class="am-modes" data-access-modes>
    <ListCard>
      {#each modes as mode (mode)}
        <ListRow
          key={mode}
          icon={icon(mode)}
          title={title(mode)}
          subtitle={subtitle(mode)}
          onclick={() => select(mode)}
        />
      {/each}
    </ListCard>
  </div>

  {#if current !== null && purpose !== 'recovered'}
    <p class="gate-note" data-access-current>{m.am_current({ mode: title(current) })}</p>
  {/if}
{:else if screen.screen === 'detail'}
  <!-- Screen one's second half: every consequence lives here,
       never on the screen that follows it. -->
  <div class="am-chosen" data-access-chosen={screen.mode}>
    <!-- Put the consequence above the control that selects it. Left-align
         the prose and use a neutral surface for each option. The words
         state exactly what the chosen mode does. -->
    <div class="am-notice">
      <span class="am-notice-ico"><Icon name={tiedToDevice(screen.mode) ? 'alert' : 'shield'} size={20} /></span>
      <p>{consequence(screen.mode)}</p>
    </div>

    {#if tiedToDevice(screen.mode)}
      <!-- Said once, next to both modes it is true of, because it is the
           one sentence that turns "tied to this device" into something a
           person can act on. -->
      <p class="am-export-note gate-body" data-access-export-note>{m.am_export_note()}</p>
    {/if}

    {#if needsSecret(screen.mode)}
      <!-- Nothing typed yet: this button only moves to screen two, which is
           where actually confirming a PIN or a passphrase happens. -->
      <div class="gate-actions">
        <button class="btn btn-primary" data-access-continue disabled={busy} onclick={proceed}>
          <span>{m.continue()}</span>
        </button>
      </div>
    {:else if screen.mode === 'biometric'}
      <!-- No field, because there is nothing to choose: the secret is
           whatever the authenticator releases, and the button is the whole
           of the interaction. The prompt the platform draws next is the
           part a person recognises. Confirmed here rather than on a second
           screen, because a mode with nothing to type has nothing a second
           screen could show. -->
      <div class="gate-actions">
        <button class="btn btn-primary" data-access-submit disabled={busy} onclick={() => submit('biometric', '')}>
          <span>{busy ? m.encrypting() : m.am_confirm_biometric()}</span>
        </button>
      </div>
      <p class="pin-status small" role="alert" data-access-status>{shownError}</p>
    {:else if screen.mode === 'unlocked'}
      <div class="gate-actions">
        <button class="btn btn-primary" data-access-submit disabled={busy} onclick={() => submit('unlocked', '')}>
          <span>{busy ? m.encrypting() : m.am_confirm_unlocked()}</span>
        </button>
      </div>
      <p class="pin-status small" role="alert" data-access-status>{shownError}</p>
    {:else}
      <div class="gate-actions">
        <button class="btn btn-primary" data-access-submit disabled={busy} onclick={() => submit('device-bound', '')}>
          <span>{busy ? m.encrypting() : android ? m.am_confirm_device() : m.am_confirm_unlocked()}</span>
        </button>
      </div>
      <p class="pin-status small" role="alert" data-access-status>{shownError}</p>
    {/if}

    <div class="gate-foot">
      <button class="btn btn-ghost" data-access-back disabled={busy} onclick={pickAnother}>
        <span>{m.am_pick_another()}</span>
      </button>
    </div>
  </div>
{:else}
  <!-- Screen two: one instruction and one control, nothing this ticket's
       no-scroll rule has to fight (screen.screen === 'secret' here). -->
  <div class="am-secret" data-access-secret={screen.mode}>
    {#if screen.mode === 'passphrase'}
      <form class="gate-form" onsubmit={submitPassphrase}>
        <!-- Both on the rule (rule 13): a passphrase is a typed answer with
             its characters hidden, and this screen is the gate's own. -->
        <div class="typed">
          <label class="field-label" for="am-passphrase">{m.pp_label_setup()}</label>
          <input
            class="rule-input"
            type="password"
            id="am-passphrase"
            name="passphrase"
            autocomplete="new-password"
            bind:value={passphrase}
            disabled={busy}
          />
        </div>
        <div class="typed">
          <label class="field-label" for="am-passphrase-confirm">{m.pp_label_confirm()}</label>
          <input
            class="rule-input"
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
          <span>{busy ? m.encrypting() : m.am_confirm_passphrase()}</span>
        </button>
      </form>
    {:else if screen.mode === 'pin'}
      <!-- Only which of the two entries this is. What a PIN costs and buys
           is on the screen before this one, said once. -->
      <p class="gate-body" data-access-pin-step>
        {confirmingPin ? m.pin_confirm_body() : m.am_pin_choose()}
      </p>
      <PinPad bind:value={pin} disabled={busy} {refusals} onComplete={completePin} />
      <p class="pin-status small" role="alert" data-access-status>{shownError}</p>
    {/if}

    <div class="gate-foot">
      <button class="btn btn-ghost" data-access-secret-back disabled={busy} onclick={backFromSecret}>
        <span>{m.back()}</span>
      </button>
    </div>
  </div>
{/if}
    </div>
  {/key}
</div>

<style>
  /* Both screens in one cell while they cross, so the outgoing one does not
     stand above the incoming one and double the height of the page for the
     length of the change. Setup's own stage is the same shape and for the
     same reason. */
  .am-stage {
    display: grid;
    flex: 1 1 auto;
    min-height: 0;
  }
  .am-stage > * {
    grid-area: 1 / 1;
    min-height: 0;
  }
  .am-stage-screen {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* The module's own notice surface: one outline, an icon, and as many lines
     as the consequence being stated actually needs. Local rather than in
     screens.css because this is its only consumer
     (scripts/check-screens-classes.mjs enforces that), and named for the
     module rather than the gate frame because it appears inside a settings
     card too.

     It replaces .gate-modes, the passphrase gate's old "here are your
     options" block. The options are rows now; what this carries is one
     mode's consequence.

     Left, as everything on a gate is since redesign ticket 34: four or five
     lines of prose that has to be read once and understood does not go in a
     centred column. The gate frame used to centre everything by default and
     the first build of this screen inherited it, which is what looking at
     the render caught. */
  .am-notice {
    display: flex;
    gap: var(--space-3);
    text-align: left;
    margin-top: var(--space-4);
    padding: var(--space-4);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
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
