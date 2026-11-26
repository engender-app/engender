<script lang="ts">
  /* Require a deliberate reveal for resurfaced photos regardless
     of era mute (ADR-0049). Keep consent local and mount PhotoThumb
     only after reveal so the bytes stay unread. Transfer focus
     from the removed cover button to the photo. Crossfade in one cell. */
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';
  import { m } from '$lib/paraglide/messages';
  import PhotoThumb from './PhotoThumb.svelte';
  import Icon from './Icon.svelte';
  import type { Photo } from '$lib/data/types';

  let {
    photo,
    size = 72,
    label = ''
  }: {
    photo: Pick<Photo, 'fileName'> & { id?: string };
    size?: number;
    label?: string;
  } = $props();

  let revealed = $state(false);
  let shown = $state<HTMLElement>();

  async function reveal() {
    revealed = true;
    await tick();
    shown?.focus({ preventScroll: true });
  }
</script>

<span class="resurfaced-photo">
  {#if revealed}
    <span class="resurfaced-photo-shown" tabindex="-1" bind:this={shown} data-resurfaced-photo in:fade={{ duration: motionDuration('--dur-med'), easing: EASE_OUT }}>
      <PhotoThumb {photo} {size} {label} />
    </span>
  {:else}
    <button
      type="button"
      class="resurfaced-photo-cover"
      style:width="{size}px"
      style:height="{size}px"
      data-resurfaced-photo-cover
      aria-label={m.resurfacing_photo_reveal()}
      onclick={reveal}
      out:fade={{ duration: motionDuration('--dur-med'), easing: EASE_OUT }}
    >
      <Icon name="eyeOff" size={Math.min(24, size / 3)} />
    </button>
  {/if}
</span>

<style>
  .resurfaced-photo {
    display: grid;
    flex-shrink: 0;
  }
  .resurfaced-photo > * {
    grid-area: 1 / 1;
  }
  .resurfaced-photo-shown {
    display: block;
    border-radius: var(--r-block);
  }
  .resurfaced-photo-cover {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: var(--r-block);
    background: var(--surface-2);
    border: 1px solid var(--outline);
    color: var(--text-2);
  }
</style>
