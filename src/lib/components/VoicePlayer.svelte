<script lang="ts">
  import { audioMimeOf } from '$lib/data/voiceRecordings/mime';
  import { readRecording } from '$lib/stores/voiceFiles';
  import { waveformFor } from '$lib/media/waveform';
  import { wipe } from '$lib/motion/reveal';
  import MediaTransport from './MediaTransport.svelte';

  /* Plays a recording directly from the entry view/editor - no separate
     screen (ticket 24). The transport is MediaTransport.svelte, the app's
     own, which replaced a plain `<audio controls>` on ticket 46; the element
     is still what plays the audio, with its own controls off.

     What this adds over the transport is the waveform: a recording's bars,
     decoded once per file and cached for the tab (media/peaks.ts). They
     arrive after the row does, which is why the transport draws the plain
     track until they land rather than a shape that is not this recording's.

     The object-URL lifecycle mirrors PhotoThumb.svelte's: load once per
     `fileName`/`bytes` change, revoke on cleanup so a long recordings list
     does not leak one blob per tile. */
  let {
    fileName,
    bytes,
    onDuration
  }: {
    /** A stored recording's file name. Omitted for one just recorded but
        not yet saved, which has no stored file until the entry is. */
    fileName?: string | null;
    /** Bytes to play instead of reading any: what the editor passes for a
        recording just made, which has nothing stored yet. */
    bytes?: Uint8Array;
    /** This recording's length, once the browser knows it: the memo
        browser adds them up for its reading. */
    onDuration?: (seconds: number) => void;
  } = $props();

  let url = $state<string | null>(null);
  let peaks = $state<Float32Array | null>(null);
  let media = $state<HTMLAudioElement>();

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
      /* A recording made here is a webm; an imported one is whatever the
         app it came from recorded, so the type comes from the stored name
         (voiceRecordings/mime.ts). Bytes with no name at all are one
         just recorded, which is always this app's own container. */
      const type = name ? audioMimeOf(name) : 'audio/webm';
      objectUrl = URL.createObjectURL(new Blob([loaded as BlobPart], type ? { type } : undefined));
      url = objectUrl;
    });

    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });

  /* The bars, on their own clock. Separate from the object URL above because
     a decode is the slow half and the row should be playable before it
     finishes - the transport is complete without a waveform. */
  $effect(() => {
    const given = bytes;
    const name = fileName ?? null;
    peaks = null;
    if (!given && !name) return;

    let stale = false;
    waveformFor(name, given).then((bars) => {
      if (!stale) peaks = bars;
    });
    return () => {
      stale = true;
    };
  });
</script>

{#if url}
  <!-- Uncovered from its own edge rather than faded up from nothing
       (DIRECTION rule 10): the row is a block and blocks clip in. `|global`
       because the {#if} above is what flips, and a transition on a child of
       a block that is itself appearing would otherwise never play. -->
  <div class="voice-player" in:wipe|global>
    <audio bind:this={media} src={url} preload="metadata"></audio>
    <MediaTransport {media} {peaks} {onDuration} />
  </div>
{/if}

<style>
  .voice-player {
    flex: 1;
    min-width: 0;
  }
</style>
