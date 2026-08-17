<script lang="ts">
  /* The three ways the app answers "is this you", together (ticket 18).
     Previously the passphrase lived under Privacy and the PIN lived behind
     a switch on the same page with no shared home; biometrics had no
     settings surface at all, because nobody was ever asked about it. This
     screen is that shared home - the ask itself happens where each method
     first becomes relevant (AndroidKeyGate, LockScreen), not here; here is
     only for seeing what is on and changing it. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { bootState } from '$lib/stores/boot.svelte';
  import { isAndroid } from '$lib/platform';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';

  /* Neither surface biometrics could apply to (ADR-0014: the boot gate for
     device-bound mode, the PIN pad's own key) exists yet, so the toggle
     would have nothing to affect. Not disabled - Switch has no such prop,
     and the answer is still worth recording early - just named, the same
     way `lock_needs_app_lock` already names an inapplicable state. */
  let bioApplies = $derived(bootState.accessMode === 'device-bound' || prefs.appLock);
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.settings_security_row()}</h1>
    <div class="header-action"></div>
  </header>

  <div class="card">
    <p class="ob-text">{m.security_intro()}</p>
  </div>

  <div class="list-group">
    <a class="list-row" href="/settings/passphrase">
      <span class="row-icon"><Icon name="shield" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.settings_passphrase_row()}</span>
        <span class="row-subtitle">
          {bootState.accessMode === 'device-bound' ? m.settings_passphrase_sub_device() : m.settings_passphrase_sub_portable()}
        </span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <div class="list-row" style="cursor:default">
      <span class="row-icon"><Icon name="lock" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.app_lock()}</span>
        <span class="row-subtitle">
          {#if prefs.appLock}
            {m.on()} · {isAndroid() ? m.settings_lock_on_pin_bio() : m.settings_lock_on_pin()}
          {:else}{m.off()}{/if}
        </span>
      </span>
      {#if prefs.appLock}
        <a class="icon-btn" href="/settings/lock" aria-label={m.try_it()}><Icon name="chevronRight" size={20} /></a>
      {/if}
      <Switch
        checked={prefs.appLock}
        label={m.app_lock()}
        onChange={(v) => {
          /* Turning it on is the setup screen's job to finish: it writes
             both the hash and the flag once a PIN has been typed twice, so
             the flag is never on without a PIN behind it. Turning it off
             drops the hash, because the hash is what the gate reads. */
          if (v) {
            goto('/settings/lock?setup=1&next=/settings/security');
            return;
          }
          prefs.appLock = false;
          prefs.pinHash = null;
        }}
      />
    </div>
    {#if isAndroid()}
      <div class="list-row" style="cursor:default">
        <span class="row-icon"><Icon name="fingerprint" size={22} /></span>
        <span class="row-text">
          <span class="row-title">{m.bio_row_title()}</span>
          <span class="row-subtitle">
            {m.bio_row_sub()}{bioApplies ? '' : ` · ${m.bio_row_needs_surface()}`}
          </span>
        </span>
        <Switch
          checked={prefs.bioOptIn === true}
          label={m.bio_row_title()}
          onChange={(v) => {
            prefs.bioOptIn = v;
          }}
        />
      </div>
    {/if}
  </div>
</div>
