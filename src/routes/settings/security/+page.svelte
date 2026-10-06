<script lang="ts">
  /* How the app answers "is this you", in one place (ticket 18, rebuilt by
     ticket 53).

     There used to be three rows here for three disconnected mechanisms: a
     passphrase, an app-lock PIN that encrypted nothing, and a biometric
     toggle with no surface to apply to. ADR-0041 collapses the first two into
     one access mode, so this screen now has one row that matters - which mode
     the journal is on - plus the switches that sit beside it.

     That row also says when the mode's secret is asked for again, because
     it is the same secret and the same screen decides both (lock-timing
     ticket 01). The lock-on-leave switch that used to sit here as a second
     mechanism is that screen's second question now. The Android "Open
     automatically" switch is gone altogether: the screen-lock prompt always
     fires by itself at start (lock-timing ticket 01). */
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { bootState } from '$lib/stores/boot.svelte';
  import { accessModeHasSecret } from '$lib/data/journal-access-mode';
  import { lockAfterSub } from '$lib/lock/lock-after-words';
  import { recoveryKeyPresence, refreshRecoveryKeyPresence } from '$lib/data/recoveryKeyPresence.svelte';
  import { isAndroid } from '$lib/platform';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import { resize } from '$lib/motion/reveal';
  import { accessModeTitle } from '$lib/components/AccessModeSetup.svelte';

  let android = $derived(isAndroid());
  /** Whether there is a secret to ask for again mid-session. False for
      device-bound mode on the web and unlocked mode on Android, where the
      row names the mode and nothing else. */
  let hasSecret = $derived(accessModeHasSecret(bootState.accessMode, android));

  let modeLine = $derived.by(() => {
    if (!bootState.accessMode) return '';
    const name = accessModeTitle(bootState.accessMode);
    return hasSecret ? `${name} · ${lockAfterSub[prefs.lockAfter]()}` : name;
  });

  /* Read once on mount rather than derived from anything: whether a
     recovery key exists is a file on disk, not app state, and this screen
     is the only place that asks. Undefined until it answers, so the row
     states neither thing while it does not know (ADR-0054, ticket
     sec-01). */
  refreshRecoveryKeyPresence();
</script>

<div class="screen">
  <ScreenHeader title={m.settings_lock_row()} back="/settings" />

  <div data-security-list use:resize>
    <ListCard>
      <ListRow
        key="access-mode"
        icon="shield"
        title={m.settings_access_mode_row()}
        subtitle={modeLine}
        href="/settings/access-mode"
      />
      <ListRow
        key="recovery-key"
        icon="key"
        title={m.rk_row_title()}
        subtitle={!recoveryKeyPresence.known
          ? undefined
          : recoveryKeyPresence.exists
            ? m.rk_row_sub_active()
            : [m.rk_row_sub_none(), m.rk_row_sub_none_consequence()]}
        href="/settings/recovery-key"
      />
      {#if android}
        <!-- Android only: FLAG_SECURE has no web equivalent, and a toggle
             that did nothing on this platform would be worse than none
             (screen-capture-guard/01). Replaces the isDebuggable() carve-out
             that used to hand this to any debug build. -->
        <ListRow
          static
          key="screen-capture"
          icon="eyeOff"
          title={m.screen_capture_title()}
          subtitle={[m.screen_capture_sub(), m.screen_capture_sub_recents()]}
        >
          {#snippet trailing()}
            <Switch
              checked={prefs.allowScreenCapture}
              label={m.screen_capture_title()}
              onChange={(v) => {
                prefs.allowScreenCapture = v;
              }}
            />
          {/snippet}
        </ListRow>
      {/if}
    </ListCard>
  </div>
</div>
