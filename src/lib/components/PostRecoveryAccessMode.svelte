<script lang="ts">
  /* What a recovery unlock lands on (ADR-0054, ticket sec-02): the access-mode
     module, with no way past it.

     The journal is genuinely open behind this - the data key is in memory and
     writes would work - so this is not a gate and does not pretend to be one.
     It is rendered instead of the route, the way the layout renders the
     mid-session lock instead of the route, because the alternative is a
     journal whose only door is a secret the person just proved they do not
     have. Without this screen the written key becomes the daily credential
     and the paper becomes the real lock.

     The recovery key is not spent by being used and the copy says so. Somebody
     who has just recovered a journal is the last person to quietly take a
     fallback away from, and a screen that silently revoked would leave them
     with one door again - the new one - and no way to know the old had gone.

     One consequence to know about, because it is visible and not obvious.
     The module leaves out the mode the journal is already on, so a journal
     recovered out of PIN mode is offered a passphrase, a biometric or
     device-bound, and not another PIN. That is not an oversight here: PIN to
     PIN goes through `addJournalPin`, which refuses that direction on
     purpose - minting replaces the binding key before the new keystore is
     written, and from PIN mode the key being replaced is the only one that
     opens the keystore still on disk. A recovery key would in fact survive
     that interruption, which makes the refusal arguably too strict on this
     one path, but relaxing a guard that protects against an unopenable
     journal is not this ticket's to do. Anybody who wants a PIN again can
     set one from Settings once they are on another mode.

     No skip, and no reset either: a reset is offered at every gate that can
     be met without a journal, and this one is met with an open journal, where
     "delete everything" is not the sentence somebody needs. Reloading is the
     way out for anyone who would rather think about it - that lands back at
     the gate, where the written key still works. */
  import { m } from '$lib/paraglide/messages';
  import { bootState, changeAccessMode } from '$lib/stores/boot.svelte';
  import { BiometricUnavailableError } from '$lib/data/webauthn-prf';
  import { toast } from '$lib/stores/toasts.svelte';
  import GateScreen, { gateBodyClass } from './GateScreen.svelte';
  import AccessModeSetup, { type AccessSetupMode } from './AccessModeSetup.svelte';

  let busy = $state(false);
  let error = $state('');
  let chosen = $state<AccessSetupMode | null>(null);

  async function choose(mode: AccessSetupMode, secret: string) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      /* Clears the debt itself, after the wrap lands (boot.svelte.ts), so
         this screen goes when there is a secret the person has and not
         before. Nothing here navigates: the layout renders the route again
         the moment the flag clears. */
      await changeAccessMode(mode, secret);
      toast(m.am_changed_toast());
    } catch (e) {
      console.error('choosing an access mode after a recovery unlock failed', e);
      error = e instanceof BiometricUnavailableError ? m.am_biometric_unavailable() : m.am_change_failed();
    } finally {
      busy = false;
    }
  }
</script>

<GateScreen icon="shield" title={m.rkr_title()} data-post-recovery-setup>
  <p class={gateBodyClass(m.rkr_body())} data-post-recovery-body>{m.rkr_body()}</p>
  <AccessModeSetup purpose="change" current={bootState.accessMode} {busy} {error} onChoose={choose} bind:chosen />
</GateScreen>
