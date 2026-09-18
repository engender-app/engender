<script lang="ts">
  import { readVideoNote } from '$lib/stores/voiceFiles';
  import { m } from '$lib/paraglide/messages';
  import { wipe } from '$lib/motion/reveal';
  import Icon from './Icon.svelte';
  import MediaTransport from './MediaTransport.svelte';

  /* Plays a video note directly from the entry view/editor - no separate
     screen (ticket 22). The transport is MediaTransport.svelte, the same one
     a recording wears (ticket 46): the same play control, the same scrub,
     the same materials, under the frame rather than floating over it - a
     translucent bar across the picture is the one material DIRECTION rule 10
     refuses.

     What the frame adds over a recording's row is the picture itself, a
     centre control over it (the gesture everyone has for a video), and full
     screen, which takes the whole player and not just the picture so the
     transport is still there to scrub with.

     `preload="metadata"` rather than a stored poster frame: the first frame
     the browser decodes is the still it shows, and a poster would be derived
     state the schema does not keep (ADR-0010).

     The object-URL lifecycle mirrors VoicePlayer's: load once per
     `fileName`/`bytes` change, revoke on cleanup so a long list does not
     leak one blob per row. */
  let {
    fileName,
    bytes,
    src
  }: {
    /** A stored note's file name. Omitted for one just recorded but not yet
        saved, which has no stored file until the entry is. */
    fileName?: string | null;
    /** Bytes to play instead of reading any: what the editor passes for a
        note just made, which has nothing stored yet. */
    bytes?: Uint8Array;
    /** A URL the caller already holds and already revokes - the photo
        journey's timelapse preview, which is a video this app just rendered
        rather than a note anybody recorded. It is the third caller and the
        reason this component is the app's one video player rather than the
        video note's: a second player drawn for one preview screen is exactly
        the thing ticket 46 exists to stop. */
    src?: string | null;
  } = $props();

  let url = $state<string | null>(null);
  let media = $state<HTMLVideoElement>();
  let playing = $state(false);
  let player = $state<HTMLDivElement>();
  let full = $state(false);

  $effect(() => {
    const given = bytes;
    const name = fileName;
    const handed = src;
    url = handed ?? null;
    if (handed || (!given && !name)) return;

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

  /* Full screen is the document's state, not this component's, so it is read
     back from the event rather than assumed: leaving with the system's own
     gesture (Escape, or Android's back) has to reach the label too. */
  $effect(() => {
    const onChange = () => (full = document.fullscreenElement === player);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  });

  async function toggleFull() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await player?.requestFullscreen();
  }
</script>

<!-- The frame and the transport row are there from the first frame, at the
     size they will be, and the picture is uncovered inside them once the
     file has been read: a player that appeared at full height would move
     everything under it in one frame, which is the standing motion clause's
     own definition of a yank. -->
<div class="video-note" class:is-full={full} bind:this={player}>
  <div class="video-note-frame">
    {#if url}
      <!-- Uncovered from its own edge (DIRECTION rule 10), `|global` because
           the {#if} is the thing that flips. -->
      <div class="video-note-picture" in:wipe|global>
        <!-- No caption track: a video note is the person's own recording of
             themselves, with nothing to transcribe that they did not just
             say. The same call media/photos/export makes for its
             timelapse. -->
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={media}
          class="video-note-player"
          preload="metadata"
          playsinline
          src={url}
          onclick={() => (media?.paused ? media.play() : media?.pause())}
        ></video>
        <!-- The gesture everyone already has for a video. It is the
             transport's own play control drawn larger, in the same ink, and
             it withdraws while the picture is playing rather than being
             taken away. -->
        <button
          type="button"
          class="video-note-key"
          class:is-away={playing}
          tabindex={-1}
          aria-hidden="true"
          onclick={() => media?.play()}
        >
          <Icon name="play" size={22} />
        </button>
      </div>
    {/if}
  </div>

  <MediaTransport {media} bind:playing>
    {#snippet trailing()}
      <button
        type="button"
        class="icon-btn"
        data-video-full
        aria-label={full ? m.mt_leave_full() : m.mt_full()}
        onclick={toggleFull}
      >
        <Icon name={full ? 'collapse' : 'expand'} size={20} />
      </button>
    {/snippet}
  </MediaTransport>
</div>

<style>
  .video-note {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    flex: 1;
  }

  /* A fixed shape, held before the file is read and kept after it: a frame
     that resized itself to each note's own aspect would move the row - and
     everything under it - on the frame the metadata landed. A portrait note
     sits inside it rather than reshaping it. */
  .video-note-frame {
    position: relative;
    display: flex;
    aspect-ratio: 16 / 9;
    max-height: 40vh;
    border-radius: var(--r-block);
    /* Clip rather than hidden: an overflow of `hidden` is a scroll container
       the browser will scroll, and the centre control is absolutely
       positioned inside this box. */
    overflow: clip;
    background: #000;
  }

  .video-note-picture {
    position: absolute;
    inset: 0;
  }

  /* A portrait note and a landscape note both fit the same frame: `contain`
     is what keeps a portrait note whole rather than cropping it to a
     letterbox. */
  .video-note-player {
    width: 100%;
    height: 100%;
    object-fit: contain;
    cursor: pointer;
  }

  .video-note-key :global(.icon) {
    fill: currentColor;
  }

  .video-note-key {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 56px;
    height: 56px;
    border: none;
    border-radius: var(--r-block);
    background: var(--text);
    color: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      opacity var(--dur-med) var(--ease-out),
      scale var(--dur-med) var(--ease-out);
  }
  /* Withdrawn, not removed: it fades and shrinks where it stands, so nothing
     in this frame is ever in neither place for a frame. */
  .video-note-key.is-away {
    opacity: 0;
    scale: 0.7;
    pointer-events: none;
  }

  /* Full screen takes the player, so the transport comes with the picture
     rather than leaving a scrub nobody can reach. The frame grows into the
     space and the row sits under it on the app's own ground. */
  .video-note:fullscreen {
    justify-content: center;
    padding: var(--space-4);
    background: var(--bg);
  }
  .video-note:fullscreen .video-note-frame {
    max-height: 85vh;
  }
</style>
