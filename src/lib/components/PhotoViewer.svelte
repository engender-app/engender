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
    onClose,
    ownerHref,
    caption
  }: {
    /** Null keeps the sheet closed. `bytes` is what the editor passes for a
        photo just picked, which has no stored file until the entry is
        saved. */
    photo: (Pick<Photo, 'fileName'> & { bytes?: Uint8Array }) | null;
    onClose: () => void;
    ownerHref?: string;
    caption?: string;
  } = $props();

  let url = $state<string | null>(null);
  let failed = $state(false);

  $effect(() => {
    const current = photo;
    url = null;
    failed = false;
    if (!current) return;

    if (current.bytes) {
      const objectUrl = URL.createObjectURL(new Blob([current.bytes as BlobPart], { type: 'image/jpeg' }));
      url = objectUrl;
      return () => URL.revokeObjectURL(objectUrl);
    }

    const fileName = current.fileName;
    if (!fileName) { failed = true; return; }

    let objectUrl: string | null = null;
    let stale = false;
    readPhoto(fileName).then((loaded) => {
      if (stale) return;
      if (!loaded) { failed = true; return; }
      objectUrl = URL.createObjectURL(new Blob([loaded as BlobPart], { type: 'image/jpeg' }));
      url = objectUrl;
    }).catch(() => { if (!stale) failed = true; });
    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

<Sheet open={photo !== null} title={m.photo_view_title()} {onClose}>
  {#if caption}<p>{caption}</p>{/if}
  {#if failed}<p role="status">{m.photo_unreadable()}</p>{/if}
  {#if url && !failed}
    <div class="photo-viewer-frame" data-photo-viewer>
      <img src={url} alt={m.photo_alt()} onerror={() => (failed = true)} />
    </div>
  {/if}
  {#if ownerHref}
    <a class="btn btn-soft press" data-photo-owner href={ownerHref}>{m.photo_open_owner()}</a>
  {/if}
</Sheet>

<style>
  .photo-viewer-frame {
    width: 100%; max-height: 70vh;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--r-block); overflow: hidden;
    background: var(--surface-2);
  }
  .photo-viewer-frame img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
