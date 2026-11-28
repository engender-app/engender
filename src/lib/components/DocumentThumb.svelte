<script lang="ts">
  /* Show the document's own preview on the index (ADR-0065). Keep
     an unreadable PDF's kind mark as fallback. A photo grid's
     lazy colour placeholder adds no value here.

     Read the area's thumbnail name. readThumbnail can return
     the underlying PDF bytes as JPEG after rewriting the suffix. */
  import { fade } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { documentThumbName, isPdfDocument } from '$lib/data/journal/documents';
  import { motionDuration } from '$lib/motion/tokens';
  import { readThumbnailFile } from '$lib/stores/photoFiles';

  let {
    fileName,
    title,
    size = 48
  }: {
    /** The document's stored file, which names both its kind and its
        thumbnail. */
    fileName: string;
    /** What the person called the paper - the image's alt, since the page
        itself is never read (ADR-0065). */
    title: string;
    size?: number;
  } = $props();

  let url = $state<string | null>(null);

  /* Bytes and a blob URL are the external resource an effect is for: the
     URL is revoked when the row unmounts or the document changes, the same
     two moves PhotoThumb and the document's own screen make. */
  $effect(() => {
    const name = fileName;
    let stale = false;
    let objectUrl: string | null = null;

    readThumbnailFile(documentThumbName(name)).then(
      (bytes) => {
        if (stale || !bytes) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
        url = objectUrl;
      },
      // A file written under another key throws out of the store rather
      // than reading as null, and the kind mark is already what the row is
      // showing - swallowing it here keeps it from surfacing as an
      // unhandled rejection (PhotoThumb.svelte says the same).
      () => {}
    );

    return () => {
      stale = true;
      url = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

<span class="doc-thumb" style:width="{size}px" style:height="{size}px">
  <Icon name={isPdfDocument(fileName) ? 'documents' : 'image'} size={22} />
  <!-- Over the mark rather than instead of it, and faded in: the bytes
       land a moment after the row does, and a page appearing at full
       opacity in one frame is a yank. -->
  {#if url}
    <img src={url} alt={title} in:fade={{ duration: motionDuration('--dur-fast') }} />
  {/if}
</span>

<style>
  .doc-thumb {
    position: relative;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: var(--r-block);
    overflow: hidden;
    border: 1px solid var(--hairline);
    color: var(--text-2);
  }

  .doc-thumb img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    /* The top of a page, not its middle: a letterhead and the first lines
       are what tell two documents apart, and a centred crop of A4 is the
       blank middle of it. */
    object-fit: cover;
    object-position: top center;
    display: block;
  }
</style>
