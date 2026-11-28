<script module lang="ts">
  import type { Component } from 'svelte';

  // Reuse the loaded component synchronously when the next screen mounts,
  // so its notice is present in the incoming view-transition snapshot.
  let UpdateNotice = $state<Component>();
  let loading: Promise<void> | undefined;
</script>

<script lang="ts">
  /* ScreenHeader and Home place this after their field, at the content's
     width. Setup and gates have no slot. A retained door only draws its
     notice while active, so hidden doors cannot announce the same release.
     Load after boot to preserve the first-load budget. The worker precaches
     the chunk, so an installed release can still show it offline. */
  import { bootState, browserSession } from '$lib/stores/boot.svelte';
  import { isReadyState } from '$lib/stores/boot-state';
  import { isLocked } from '$lib/stores/lock.svelte';
  import { useDoorActivity } from '$lib/navigation/doorActivity.svelte';

  const doorActive = useDoorActivity();
  const active = $derived(isReadyState(bootState) && !isLocked(bootState.accessMode) && !browserSession.recovering && doorActive());
  $effect(() => {
    if (active) loading ??= import('./UpdateNotice.svelte').then((module) => { UpdateNotice = module.default; });
  });
</script>

{#if active && UpdateNotice}
  <UpdateNotice />
{/if}
