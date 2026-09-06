<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import type { Photo } from '$lib/data/types';
  import { readPhoto } from '$lib/stores/photoFiles';
  import Sheet from './Sheet.svelte';

  /* A tap on an attachment's thumbnail opens this rather than doing nothing
     (ticket CARPET-06). Full resolution via readPhoto, not the thumbnail
     PhotoThumb reads elsewhere - the same reasoning as
     PhotoAlignmentReview.svelte's reference image: a lightbox showing a
     72px-sourced thumbnail blown up would show less than the photo has. */
  let {
    photo,
    onClose
  }: {
    /** Null keeps the sheet closed. `bytes` is what the editor passes for a
        photo just picked, which has no stored file until the entry is
        saved. */
    photo: (Pick<Photo, 'fileName'> & { bytes?: Uint8Array }) | null;
    onClose: () => void;
  } = $props();

  let url = $state<string | null>(null);

  $effect(() => {
    const current = photo;
    url = null;
    if (!current) return;

    if (current.bytes) {
      const objectUrl = URL.createObjectURL(new Blob([current.bytes as BlobPart], { type: 'image/jpeg' }));
      url = objectUrl;
      return () => URL.revokeObjectURL(objectUrl);
    }

    const fileName = current.fileName;
    if (!fileName) return;

    let objectUrl: string | null = null;
    let stale = false;
    readPhoto(fileName).then((loaded) => {
      if (stale || !loaded) return;
      objectUrl = URL.createObjectURL(new Blob([loaded as BlobPart], { type: 'image/jpeg' }));
      url = objectUrl;
    });
    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

<Sheet open={photo !== null} title={m.photo_view_title()} {onClose}>
  {#if url}
    <div class="photo-viewer-frame">
      <img src={url} alt={m.photo_alt()} />
    </div>
  {/if}
</Sheet>

<style>
  .photo-viewer-frame {
    width: 100%; max-height: 70vh;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius-md); overflow: hidden;
    background: var(--surface-2);
  }
  .photo-viewer-frame img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
