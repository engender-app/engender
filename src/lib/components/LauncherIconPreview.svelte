<script lang="ts">
  import { prefs } from '$lib/data/prefs/store.svelte';
  import Mark from './Mark.svelte';
</script>

{#if prefs.disguise}
  <img src="/icons/icon-notes.svg" alt="" width="32" height="32" />
{:else}
  <Mark size={32} crop={prefs.launcherIconShape === 'round' ? 'launcher-round' : 'tile'} />
{/if}
