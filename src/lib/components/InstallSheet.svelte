<script lang="ts">
  /* The install hand-off from the landing site (installRequest.ts has why
     it starts there). A sheet rather than a notice: the person asked for
     exactly this a moment ago, on another page, so it is the one thing on
     screen they came for, and a sheet can be put away with the gestures
     every other sheet takes. It never interrupts a gate: the layout mounts
     it only over an open, unlocked journal with its chrome, which for a new
     person means after setup rather than in front of it.

     Which surface is installVariant.ts's call. The prompt it replays needs a
     tap, so nothing here ever prompts on its own; a dismissal in the
     browser's dialog just closes the sheet, and an install says it worked
     with a toast, the app's floating confirmation. */
  import { onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import { installRequest, waitForInstallPrompt } from '$lib/pwa/installRequest';
  import { installVariant, type InstallVariant } from '$lib/pwa/installVariant';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  const ADDON_URL = 'https://addons.mozilla.org/firefox/addon/pwas-for-firefox/';
  /* How long a missing prompt is waited for, counted from the request.
     Chromium fires it within a second or two of the page loading when it
     fires at all, and boot usually spends this before the sheet mounts. */
  const PROMPT_WAIT_MS = 2000;
  const VARIANTS: InstallVariant[] = ['prompt', 'ios', 'android-menu', 'firefox-desktop', 'mac-safari', 'desktop-menu'];

  let variant = $state<InstallVariant | null>(null);
  let open = $state(false);
  let prompting = $state(false);
  let confirmed = false;

  /* The installed app on every platform: a display mode other than a tab,
     iOS's own flag, the Capacitor shell, or a trusted web activity. */
  function runningInstalled(): boolean {
    return (
      ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(
        (mode) => matchMedia(`(display-mode: ${mode})`).matches
      ) ||
      (navigator as { standalone?: boolean }).standalone === true ||
      isAndroid() ||
      document.referrer.startsWith('android-app://')
    );
  }

  function confirmInstalled() {
    if (confirmed) return;
    confirmed = true;
    open = false;
    toast(m.install_done());
  }

  onMount(() => {
    let live = true;
    addEventListener('appinstalled', confirmInstalled);
    void waitForInstallPrompt(PROMPT_WAIT_MS).then(() => {
      if (!live || !installRequest.pending) return;
      const forced = __DEMO__ ? VARIANTS.find((name) => name === installRequest.forced) : undefined;
      const next =
        forced ??
        installVariant({
          userAgent: navigator.userAgent,
          touchPoints: navigator.maxTouchPoints,
          installed: runningInstalled(),
          promptReady: installRequest.prompt !== null
        });
      installRequest.pending = false;
      if (!next) return;
      variant = next;
      /* Opened after the sheet mounted closed, so it rises like every
         other sheet rather than being painted where it lands. */
      open = true;
    });
    return () => {
      live = false;
      removeEventListener('appinstalled', confirmInstalled);
    };
  });

  async function install() {
    if (prompting) return;
    const deferred = installRequest.prompt;
    /* A demo build forcing this surface has no prompt to replay, so it
       acts out the accepted path for review. */
    if (!deferred) {
      if (__DEMO__) confirmInstalled();
      return;
    }
    prompting = true;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      // One use each: the browser sends a fresh one if it offers again.
      installRequest.prompt = null;
      if (outcome === 'accepted') confirmInstalled();
      else open = false;
    } catch (error) {
      console.error('the install prompt could not be shown', error);
      open = false;
    } finally {
      prompting = false;
    }
  }

  const close = () => (open = false);
</script>

<Sheet {open} title={m.install_title()} onClose={close} busy={prompting}>
  <h3>{m.install_title()}</h3>
  {#if variant === 'prompt'}
    <div class="stack-3">
      <button class="btn btn-primary" data-install-prompt disabled={prompting} onclick={install}>
        <Icon name="download" size={20} />
        <span>{m.install_action()}</span>
      </button>
      <button class="btn btn-ghost" data-install-close onclick={close}><span>{m.not_now()}</span></button>
    </div>
  {:else if variant === 'firefox-desktop'}
    <p class="muted">{m.install_firefox_body()}</p>
    <p class="muted small">{m.install_firefox_tab()}</p>
    <div class="stack-3">
      <a class="btn btn-primary" data-install-addon href={ADDON_URL} target="_blank" rel="noreferrer">
        <span>{m.install_firefox_addon()}</span>
        <Icon name="external" size={20} />
      </a>
      <button class="btn btn-ghost" data-install-close onclick={close}><span>{m.not_now()}</span></button>
    </div>
  {:else if variant === 'desktop-menu'}
    <p class="muted">{m.install_desktop_body()}</p>
    <button class="btn btn-ghost" data-install-close onclick={close}><span>{m.close()}</span></button>
  {:else if variant}
    <ol class="install-steps" data-install-steps={variant}>
      {#if variant === 'ios'}
        <li>{m.install_ios_share()}</li>
        <li>{m.install_ios_add()}</li>
      {:else if variant === 'android-menu'}
        <li>{m.install_android_menu()}</li>
        <li>{m.install_android_add()}</li>
      {:else}
        <li>{m.install_mac_file()}</li>
        <li>{m.install_mac_add()}</li>
      {/if}
    </ol>
    <button class="btn btn-ghost" data-install-close onclick={close}><span>{m.close()}</span></button>
  {/if}
</Sheet>

<style>
  .install-steps {
    margin: 0;
    padding-inline-start: var(--space-5);
  }
  .install-steps li + li {
    margin-top: var(--space-2);
  }
</style>
