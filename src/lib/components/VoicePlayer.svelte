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
  let box = $state<HTMLDivElement>();
  /** Whether this player has been near the screen yet. */
  let seen = $state(false);

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

  /* Decoding is the expensive half - 206ms for a seven-second recording on
     a desktop, measured by tests/media-list-cost.mjs - so it waits until the
     player is somewhere near the screen. A journal with three hundred memos
     in it mounts three hundred of these at once, and decoding all of them to
     draw bars nobody has scrolled to yet is a minute of work for a screenful
     of waveforms. Once seen, always seen: peaks are cached for the tab
     anyway, and a row that scrolls away has nothing to give back. */
  $effect(() => {
    if (seen || !box) return;
    if (typeof IntersectionObserver === 'undefined') {
      seen = true;
      return;
    }
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          seen = true;
          watch.disconnect();
        }
      },
      /* A screenful ahead, so a row has usually drawn its bars by the time
         a scroll brings it into view. */
      { rootMargin: '600px' }
    );
    watch.observe(box);
    return () => watch.disconnect();
  });

  /* The bars, on their own clock. Separate from the object URL above because
     a decode is the slow half and the row should be playable before it
     finishes - the transport is complete without a waveform. */
  $effect(() => {
    const given = bytes;
    const name = fileName ?? null;
    peaks = null;
    if (!seen || (!given && !name)) return;

    let stale = false;
    waveformFor(name, given).then((bars) => {
      if (!stale) peaks = bars;
    });
    return () => {
      stale = true;
    };
  });
</script>

<!-- The box is there from the first frame, at the height a transport is,
     and the transport is uncovered inside it once the file has been read.
     Two reasons it is this way round: nothing below the player moves when it
     arrives (the standing motion clause - a row that grows by 48px in one
     frame moves everything under it in one frame), and what does arrive
     arrives by being uncovered from its own edge rather than faded up from
     nothing (DIRECTION rule 10: blocks clip in). `|global` because the {#if}
     is what flips, and a transition on a child of something that is itself
     appearing would otherwise never play. -->
<div class="voice-player" bind:this={box}>
  {#if url}
    <audio bind:this={media} src={url} preload="metadata"></audio>
    <div class="voice-player-in" in:wipe|global>
      <MediaTransport {media} {peaks} {onDuration} />
    </div>
  {/if}
</div>

<style>
  .voice-player {
    flex: 1;
    min-width: 0;
    /* The transport's own row height, held whether or not there is anything
       to play yet. */
    min-height: var(--touch-target);
  }
</style>
