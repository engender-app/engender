<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import type { Photo } from '$lib/data/types';
  import { readPhoto } from '$lib/stores/photoFiles';

  /* A stored photo as the journal book prints it (phase 5 ticket 17):
     the full normalized file, not the thumbnail PhotoThumb draws. A 72px
     thumbnail is the right call for a scrolling grid and the wrong one for
     paper, where it lands as a smear.

     That costs memory, one decoded 2048px JPEG per photo on the page, and
     the range picker is what bounds it: a book of one year prints a year's
     photos. Nothing here downsamples, because the whole point of this
     screen is the printed copy.

     A photo with no stored file renders nothing rather than a placeholder
     tile. On screen a placeholder says "loading, or gone"; on paper it
     would just be a grey box in the middle of someone's book. */
  let { photo }: { photo: Photo } = $props();

  let url = $state<string | null>(null);

  $effect(() => {
    const fileName = photo.fileName;
    url = null;
    if (!fileName) return;

    let objectUrl: string | null = null;
    let stale = false;

    readPhoto(fileName).then((bytes) => {
      if (stale || !bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
      url = objectUrl;
    });

    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

{#if url}
  <img class="book-photo" data-book-photo src={url} alt={m.photo_alt()} />
{/if}

<style>
  .book-photo {
    display: block;
    width: 100%;
    max-width: 420px;
    height: auto;
    border-radius: var(--radius-md);
    margin-top: var(--space-2);
  }

  @media print {
    .book-photo {
      /* Keeps a photo and the day it belongs to on the same sheet. */
      break-inside: avoid;
      border-radius: 0;
    }
  }
</style>
