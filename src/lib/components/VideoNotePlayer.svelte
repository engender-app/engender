<script lang="ts">
  import { readVideoNote } from '$lib/stores/videoFiles';

  /* Plays a video note directly from the entry view/editor - no separate
     screen (ticket 22). A plain <video controls> element rather than a
     custom transport, VoicePlayer.svelte's reasoning: the browser's own
     controls are accessible and familiar out of the box.

     `preload="metadata"` rather than a stored poster frame: the first frame
     the browser decodes is the still it shows, and a poster would be derived
     state the schema does not keep (ADR-0010).

     The object-URL lifecycle mirrors VoicePlayer's: load once per
     `fileName`/`bytes` change, revoke on cleanup so a long list does not
     leak one blob per row. */
  let {
    fileName,
    bytes
  }: {
    /** A stored note's file name. Omitted for one just recorded but not yet
        saved, which has no stored file until the entry is. */
    fileName?: string | null;
    /** Bytes to play instead of reading any: what the editor passes for a
        note just made, which has nothing stored yet. */
    bytes?: Uint8Array;
  } = $props();

  let url = $state<string | null>(null);

  $effect(() => {
    const given = bytes;
    const name = fileName;
    url = null;
    if (!given && !name) return;

    let objectUrl: string | null = null;
    let stale = false;

    const source = given ? Promise.resolve(given) : readVideoNote(name!);
    source.then((loaded) => {
      if (stale || !loaded) return;
      objectUrl = URL.createObjectURL(new Blob([loaded as BlobPart], { type: 'video/webm' }));
      url = objectUrl;
    });

    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

{#if url}
  <!-- No caption track: a video note is the person's own recording of
       themselves, with nothing to transcribe that they did not just say.
       The same call media/photos/export makes for its timelapse. -->
  <!-- svelte-ignore a11y_media_has_caption -->
  <video class="video-note-player" controls preload="metadata" src={url}></video>
{/if}
