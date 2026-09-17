<script lang="ts">
  /* How the app answers "is this you", in one place (ticket 18, rebuilt by
     ticket 53).

     There used to be three rows here for three disconnected mechanisms: a
     passphrase, an app-lock PIN that encrypted nothing, and a biometric
     toggle with no surface to apply to. ADR-0041 collapses the first two into
     one access mode, so this screen now has one row that matters - which mode
     the journal is on - plus the mid-session switches that mode enables.

     The biometric row stays Android-only and keeps its old job: whether the
     mandatory Keystore prompt fires by itself or waits behind a button. It is
     not an access mode there, and its copy says what device-bound mode
     already does rather than offering a second mechanism. The web's
     biometric access mode (ticket 55) is a different thing entirely and
     appears where every mode does, in the row above. */
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { bootState } from '$lib/stores/boot.svelte';
  import { accessModeHasSecret } from '$lib/data/journal-access-mode';
  import { recoveryKeyPresence, refreshRecoveryKeyPresence } from '$lib/data/recoveryKeyPresence.svelte';
  import { isAndroid } from '$lib/platform';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import { accessModeTitle } from '$lib/components/AccessModeSetup.svelte';

  let android = $derived(isAndroid());
  /** Whether there is a secret to ask for again mid-session. False for
      device-bound mode on the web, which is the one combination where
      lock-on-leave cannot challenge anyone - named here rather than left for
      somebody to discover. */
  let hasSecret = $derived(accessModeHasSecret(bootState.accessMode, android));

  let modeName = $derived(bootState.accessMode ? accessModeTitle(bootState.accessMode) : '');

  /* The prompt this toggle affects only exists where device-bound mode is the
     one in use: it is Keystore's, and Keystore is what device-bound mode
     unlocks through. Not disabled - Switch has no such prop, and the answer
     is still worth recording early - just named. */
  let bioApplies = $derived(bootState.accessMode === 'device-bound');

  /* Read once on mount rather than derived from anything: whether a
     recovery key exists is a file on disk, not app state, and this screen
     is the only place that asks. Undefined until it answers, so the row
     states neither thing while it does not know (ADR-0054, ticket
     sec-01). */
  refreshRecoveryKeyPresence();
</script>

<div class="screen">
  <ScreenHeader title={m.settings_security_row()} back="/settings" subtitle={m.security_intro()} />

  <div data-security-list>
    <ListCard>
      <ListRow
        key="access-mode"
        icon="shield"
        title={m.settings_access_mode_row()}
        subtitle={modeName}
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
      <!-- The one mode combination where lock on leave cannot challenge anyone
           (web device-bound, no secret to ask for again): the switch is
           visibly inert rather than merely annotated, and the row itself
           becomes the way to the one screen that can fix that. Presentation
           only either way - the stored preference is neither written nor
           cleared here, so a mode change later finds it exactly as it was
           (UI/UX ticket 09). -->
      <ListRow
        key="lock-on-leave"
        icon="lock"
        title={m.lock_on_leave_title()}
        subtitle={hasSecret ? m.lock_on_leave_sub() : `${m.lock_on_leave_sub()} · ${m.lock_needs_secret()}`}
        static={hasSecret}
        href={hasSecret ? undefined : '/settings/access-mode'}
      >
        {#snippet trailing()}
          <Switch
            checked={prefs.lockOnLeave}
            label={m.lock_on_leave_title()}
            disabled={!hasSecret}
            onChange={(v) => {
              prefs.lockOnLeave = v;
            }}
          />
        {/snippet}
      </ListRow>
      {#if android}
        <ListRow
          static
          key="biometrics"
          icon="fingerprint"
          title={m.bio_row_title()}
          subtitle={`${m.bio_row_sub()}${bioApplies ? '' : ` · ${m.bio_row_needs_surface()}`}`}
        >
          {#snippet trailing()}
            <Switch
              checked={prefs.bioOptIn === true}
              label={m.bio_row_title()}
              onChange={(v) => {
                prefs.bioOptIn = v;
              }}
            />
          {/snippet}
        </ListRow>
        <!-- Android only: FLAG_SECURE has no web equivalent, and a toggle
             that did nothing on this platform would be worse than none
             (screen-capture-guard/01). Replaces the isDebuggable() carve-out
             that used to hand this to any debug build. -->
        <ListRow
          static
          key="screen-capture"
          icon="eyeOff"
          title={m.screen_capture_title()}
          subtitle={m.screen_capture_sub()}
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
