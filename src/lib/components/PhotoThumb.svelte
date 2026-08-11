<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Photo } from '$lib/data/types';

  // Only the hue is read: drafts the editor has not saved yet have no id,
  // and both render the same placeholder.
  let { photo, size = 72, label = '' }: { photo: Pick<Photo, 'hue'>; size?: number; label?: string } = $props();
</script>

<!-- Demo stand-in for stored photos; the app renders the real file here. -->
<div
  class="photo-thumb"
  style:width="{size}px"
  style:height="{size}px"
  style:background="linear-gradient(135deg, hsl({photo.hue} 45% 72%), hsl({(photo.hue + 40) % 360} 40% 55%))"
  role="img"
  aria-label="Photo placeholder{label ? ': ' + label : ''}"
>
  <Icon name="image" size={Math.min(28, size / 2.5)} />
  {#if label}<span class="photo-label">{label}</span>{/if}
</div>
