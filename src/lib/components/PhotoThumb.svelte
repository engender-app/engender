<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import type { Photo } from '$lib/data/types';
  import { readThumbnail } from '$lib/stores/photoFiles';

  /* Renders a stored photo's thumbnail, never the full file: the Progress
     grid draws dozens of these at 104px, and decoding a 2048px JPEG for
     each would be the whole point of storing thumbnails, missed
     (ADR-0008).

     The gradient underneath is what shows while the bytes load, and what
     stays if there are none - a photo with no stored file (the demo
     persona's), or one whose file the sweep reclaimed. */
  let {
    photo,
    size = 72,
    label = '',
    bytes
  }: {
    /** `id` is optional because a draft the editor has not saved has none
        (types.ts: identity is minted on write, never in a screen). It only
        feeds the placeholder colour. */
    photo: Pick<Photo, 'fileName'> & { id?: string };
    size?: number;
    label?: string;
    /** Thumbnail bytes to draw instead of loading any: what the editors pass
        for a photo just picked, which has been normalized but has no stored
        file until the entry it belongs to is saved. */
    bytes?: Uint8Array;
  } = $props();

  let url = $state<string | null>(null);

  /* Loading bytes and holding an object URL is exactly the external
     resource an effect is for: the URL has to be revoked when this
     unmounts or the photo changes, or a scrolling list leaks one blob per
     tile. */
  $effect(() => {
    const given = bytes;
    const fileName = photo.fileName;
    url = null;
    if (!given && !fileName) return;

    let objectUrl: string | null = null;
    let stale = false;

    const thumbnail = given ? Promise.resolve(given) : readThumbnail(fileName!);
    thumbnail.then((loaded) => {
      if (stale || !loaded) return;
      objectUrl = URL.createObjectURL(new Blob([loaded as BlobPart], { type: 'image/jpeg' }));
      url = objectUrl;
    });

    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });

  /* A stable colour per photo, so the placeholder does not change shade
     between renders. Derived from the id rather than stored - it stands in
     for pixels nobody has loaded yet. Drafts have no id and all land on
     the same shade, which is what the editor showed before this and is
     only visible until ticket 08 gives them real files. */
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
  aria-label={url ? undefined : label ? m.photo_placeholder_labelled({ label }) : m.photo_placeholder()}
>
  {#if url}
    <img src={url} alt={label || m.photo_alt()} />
  {:else}
    <Icon name="image" size={Math.min(28, size / 2.5)} />
  {/if}
  {#if label}<span class="photo-label">{label}</span>{/if}
</div>
