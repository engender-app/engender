<script lang="ts">
  import Icon from './Icon.svelte';
  import { readThumbnail } from '$lib/stores/photoFiles.svelte';

  /* Renders a stored photo's thumbnail, never the full file: the Progress
     grid draws dozens of these at 104px, and decoding a 2048px JPEG for
     each would be the whole point of storing thumbnails, missed
     (ADR-0008).

     The gradient underneath is what shows while the bytes load, and what
     stays if there are none - a photo with no stored file (the demo
     persona's), or one whose file the sweep reclaimed. `read` is a prop so
     the browser tier can drive it without app state. */
  let {
    photo,
    size = 72,
    label = '',
    read = readThumbnail
  }: {
    /** `id` is optional because a draft the editor has not saved has none
        (types.ts: identity is minted on write, never in a screen). It only
        feeds the placeholder colour. */
    photo: { id?: string; fileName: string | null };
    size?: number;
    label?: string;
    read?: (fileName: string) => Promise<Uint8Array | null>;
  } = $props();

  let url = $state<string | null>(null);

  /* Loading bytes and holding an object URL is exactly the external
     resource an effect is for: the URL has to be revoked when this
     unmounts or the photo changes, or a scrolling list leaks one blob per
     tile. */
  $effect(() => {
    const fileName = photo.fileName;
    url = null;
    if (!fileName) return;

    let objectUrl: string | null = null;
    let stale = false;

    read(fileName).then((bytes) => {
      if (stale || !bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
      url = objectUrl;
    });

    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });

  /* A stable colour per photo, so the placeholder does not flicker through
     a different shade on every render, and two photos side by side do not
     land on the same one. Derived from the id rather than stored: it is a
     property of the pixels only in the sense that it stands in for them. */
  const hue = $derived(
    [...(photo.id ?? '')].reduce((h, character) => (h * 31 + character.charCodeAt(0)) % 360, 7)
  );
</script>

<div
  class="photo-thumb"
  style:width="{size}px"
  style:height="{size}px"
  style:background="linear-gradient(135deg, hsl({hue} 45% 72%), hsl({(hue + 40) % 360} 40% 55%))"
  role={url ? 'presentation' : 'img'}
  aria-label={url ? undefined : `Photo placeholder${label ? ': ' + label : ''}`}
>
  {#if url}
    <img src={url} alt={label || 'Photo'} />
  {:else}
    <Icon name="image" size={Math.min(28, size / 2.5)} />
  {/if}
  {#if label}<span class="photo-label">{label}</span>{/if}
</div>
