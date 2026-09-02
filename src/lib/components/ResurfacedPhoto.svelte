<script lang="ts">
  /* A photo shown by a resurfacing surface - on-this-day, Wrapped - covered
     until a deliberate tap reveals it (phase 6 ticket 05, ADR-0049,
     CONTEXT: "Resurfacing consent"). Separate from muting an era: someone
     may be fine with old words and not old images, so this applies
     regardless of any mute.

     Local `$state`, nothing written: scrolling away and back covers the
     photo again, and nothing here remembers that a person opened it. The
     cover is the whole point, so PhotoThumb - which reads the file the
     moment it comes near the viewport - does not mount until revealed.
     A blur over an already-decoded image would still put the bytes in
     memory before anyone asked; not mounting is the only cover that is
     actually one. */
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
</script>

{#if revealed}
  <PhotoThumb {photo} {size} {label} />
{:else}
  <button
    type="button"
    class="resurfaced-photo-cover"
    style:width="{size}px"
    style:height="{size}px"
    data-resurfaced-photo-cover
    aria-label={m.resurfacing_photo_reveal()}
    onclick={() => (revealed = true)}
  >
    <Icon name="eyeOff" size={Math.min(24, size / 3)} />
  </button>
{/if}

<style>
  .resurfaced-photo-cover {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: var(--radius-md);
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
  }
</style>
