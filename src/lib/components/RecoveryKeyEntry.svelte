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
     anything is typed, so this screen is never a door onto nothing.

     No throttle, and no attempt count, which is a decision rather than an
     omission. ADR-0041 settled what a growing delay is worth: it prices out
     somebody typing at the device and buys nothing against an attack that
     never loads the app's code. Against 120 bits neither of those attackers
     arrives, so a delay here would be theatre - and it would land on the
     person who is transcribing 25 characters off paper under stress, who is
     the only human being who will ever type into this field.

     Hidden while typed unless the person asks to see it (release-blockers
     ticket 12). This is the one secret that opens the journal past every
     access mode, typed at a gate somebody may be watching, and a password
     field is also the one kind some Android keyboards promise not to learn
     from. Showing stays a tap away because comparing the field against the
     paper is how a mistyped key gets found. */
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { submitRecoveryKeyUnlock } from '$lib/stores/boot.svelte';
  import { RecoveryKeyMistypedError } from '$lib/crypto/recoveryKey';
  import { RecoveryKeyAbsentError } from '$lib/data/recovery-key';
  import { crossfadeDuration } from '$lib/motion/tokens';
  import GateScreen from './GateScreen.svelte';
  import Icon from './Icon.svelte';

  let { onBack }: { onBack: () => void } = $props();

  let typed = $state('');
  let error = $state('');
  let busy = $state(false);
  /** What the button says, which answers the press at once. */
  let shown = $state(false);
  /** What the field does, which follows at the bottom of its dip. */
  let masked = $state(true);
  let input: HTMLInputElement | undefined = $state();
  let toggle: HTMLButtonElement | undefined = $state();

  /** The characters fade out and back in around the swap, so dots never turn
      into letters in one frame. Through the crossfade duration, because this
      is opacity only and stays a fade under reduced motion, and eased in then
      out so neither half lands most of its change in its first frame. The
      caret and selection are put back, since changing an input's type can
      move them.

      The button's two faces trade over both halves, also through the
      animation API rather than a CSS transition: app.css cuts every
      transition to 1ms under reduced motion, which would swap the words in
      one frame. */
  let toggling = false;

  async function toggleShown() {
    /* One trade at a time: a second press mid-dip would flip the words
       back while the field was still on its way to the first answer. */
    if (!input || !toggle || toggling) return;
    toggling = true;
    const field = input;
    const half = crossfadeDuration();
    shown = !shown;
    for (const face of toggle.querySelectorAll<HTMLElement>('[data-face]')) {
      const arriving = (face.dataset.face === 'hide') === shown;
      face.animate([{ opacity: arriving ? 0 : 1 }, { opacity: arriving ? 1 : 0 }], {
        duration: 2 * half,
        easing: 'ease-in-out'
      });
    }
    const { selectionStart, selectionEnd } = field;
    const out = field.animate([{ color: 'transparent' }], { duration: half, easing: 'ease-in', fill: 'forwards' });
    await out.finished.catch(() => {});
    masked = !shown;
    await tick();
    field.setSelectionRange(selectionStart, selectionEnd);
    field.animate([{ color: 'transparent' }, {}], { duration: half, easing: 'ease-out' });
    out.cancel();
    toggling = false;
  }

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

<GateScreen title={m.rke_title()} data-recovery-gate>
  <p class="gate-body" data-recovery-gate-body>{m.rke_body()}</p>
  <form class="gate-form" onsubmit={submit}>
    <div>
      <div class="rke-label-row">
        <label class="field-label" for="journal-recovery-key">{m.rke_label()}</label>
        <!-- One button for both answers, its two faces stacked in one cell
             and crossfading, so the row never changes width under the
             finger. Pressing it leaves focus in the field: a person halfway
             through 25 characters should not lose the keyboard to check
             them. -->
        <button
          class="btn btn-ghost rke-toggle"
          type="button"
          aria-controls="journal-recovery-key"
          bind:this={toggle}
          data-recovery-key-toggle
          data-shown={shown}
          onpointerdown={(event) => {
            if (document.activeElement === input) event.preventDefault();
          }}
          onclick={toggleShown}
        >
          <span class="rke-toggle-faces">
            <span class="rke-toggle-face" data-face="show" aria-hidden={shown}>
              <Icon name="eye" size={16} /><span>{m.rke_show()}</span>
            </span>
            <span class="rke-toggle-face" data-face="hide" aria-hidden={!shown}>
              <Icon name="eyeOff" size={16} /><span>{m.rke_hide()}</span>
            </span>
          </span>
        </button>
      </div>
      <!-- Wide enough to hold the whole key and shaped like the screen it
           was written down from, so somebody comparing the two is comparing
           the same thing. Autocapitalise on and autocorrect off: the
           alphabet is uppercase, and every correction feature turns a valid
           key into a mistyped one. -->
      <input
        class="input rke-input"
        type={masked ? 'password' : 'text'}
        bind:this={input}
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

  /* The label keeps the line it had; the toggle's 48px target hangs into
     the space around it rather than pushing the field down, and stops at
     the field's top edge so a tap on the field always lands in it. */
  .rke-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .rke-toggle {
    margin-block: -12px -8px;
    margin-inline-end: calc(-1 * var(--space-3));
    padding-inline: var(--space-3);
    font-size: var(--text-sm);
  }
  .rke-toggle-faces { display: grid; }
  .rke-toggle-face {
    grid-area: 1 / 1;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .rke-toggle[data-shown='false'] [data-face='hide'],
  .rke-toggle[data-shown='true'] [data-face='show'] {
    opacity: 0;
  }
</style>
