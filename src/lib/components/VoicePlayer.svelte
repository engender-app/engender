<script lang="ts">
  import { readRecording } from '$lib/stores/voiceFiles';

  /* Plays a recording directly from the entry view/editor - no separate
     screen (ticket 24). A plain <audio controls> element rather than a
     custom scrubber: the browser's own transport is accessible and
     familiar out of the box, and nothing in the ticket asks for a custom
     look.

     The object-URL lifecycle mirrors PhotoThumb.svelte's: load once per
     `fileName`/`bytes` change, revoke on cleanup so a long recordings list
     does not leak one blob per tile. */
  let {
    fileName,
    bytes
  }: {
    /** A stored recording's file name. Omitted for one just recorded but
        not yet saved, which has no stored file until the entry is. */
    fileName?: string | null;
    /** Bytes to play instead of reading any: what the editor passes for a
        recording just made, which has nothing stored yet. */
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

    const source = given ? Promise.resolve(given) : readRecording(name!);
    source.then((loaded) => {
      if (stale || !loaded) return;
      objectUrl = URL.createObjectURL(new Blob([loaded as BlobPart], { type: 'audio/webm' }));
      url = objectUrl;
    });

    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

{#if url}
  <audio class="voice-player" controls src={url}></audio>
{/if}
