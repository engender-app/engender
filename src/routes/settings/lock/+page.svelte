<script lang="ts">
  /* Setting a PIN, and the "try it" preview from Settings. The gate itself
     is not a route: it renders in +layout.svelte instead of the app, so
     there is no URL that shows journal content while the app is locked. */
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import LockScreen from '$lib/components/LockScreen.svelte';

  let setup = $derived(page.url.searchParams.get('setup') === '1');
  /* Onboarding sends the new user on Home rather than into Settings, which
     is where the same screen goes when Settings sent them. A path only,
     since goto() would otherwise follow anything a crafted link put here. */
  let next = $derived.by(() => {
    const asked = page.url.searchParams.get('next');
    if (asked && /^\/(?!\/)/.test(asked)) return asked;
    return setup ? '/settings' : '/';
  });

  /* Nothing to try, and no PIN that could get you off this screen: the
     only button left would be the one that deletes everything. */
  $effect(() => {
    if (!setup && prefs.pinHash === null) goto('/settings');
  });
</script>

{#if setup || prefs.pinHash !== null}
  <LockScreen mode={setup ? 'setup' : 'unlock'} onDone={() => goto(next)} />
{/if}
