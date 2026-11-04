<script lang="ts">
  /* Taking a progress photo (pre-release-human 12, bug 25): a live camera
     with the last shot in the same pose laid over it, faint, so the body can
     be lined up the same way each time. progressCamera.ts says why this is
     an in-app camera rather than the OS one every other still photo uses.

     One frame, one size, from the moment the sheet opens to the moment it
     closes: the 3:4 box is laid out before anything arrives in it, and the
     camera, the ghost and a taken shot each fade into it rather than
     appearing. The live video stays mounted under a taken shot, so a
     retake fades the shot off a picture that never left.

     Where the camera cannot be opened - no getUserMedia, permission
     refused, no camera - the same box says so and the OS camera or a file
     takes its place, without a ghost. */
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { m } from '$lib/paraglide/messages';
  import { motionDuration } from '$lib/motion/tokens';
  import { crossfade } from '$lib/motion/reveal';
  import { readPhoto } from '$lib/stores/photoFiles';
  import { capturePhoto, pickPhotos } from '$lib/stores/photoPicking';
  import {
    captureFrame,
    openCameraStream,
    stopCameraStream,
    type CameraFacing
  } from '$lib/stores/progressCamera';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let {
    open,
    title,
    ghost,
    onSave,
    onClose
  }: {
    open: boolean;
    title: string;
    /** The newest shot in this pose, or null for the first one. */
    ghost: { fileName: string } | null;
    /** Stores the shot. `false` keeps the sheet open on it, so a failed
        write can be tried again. */
    onSave: (photo: NormalizedPhoto) => Promise<boolean | void>;
    onClose: () => void;
  } = $props();

  type Mode = 'starting' | 'live' | 'shot' | 'unavailable';

  let facing = $state<CameraFacing>('user');
  let stream = $state.raw<MediaStream | null>(null);
  let mode = $state<Mode>('starting');
  let playing = $state(false);
  let shot = $state.raw<NormalizedPhoto | null>(null);
  let saving = $state(false);
  let video = $state<HTMLVideoElement>();

  /* The camera runs while the sheet is open and only then. A late stream -
     the sheet closed or the camera switched while it was being asked for -
     is stopped as soon as it lands rather than kept. */
  $effect(() => {
    if (!open) return;
    const wanted = facing;
    let live: MediaStream | null = null;
    let cancelled = false;
    const holdingShot = untrack(() => shot) !== null;
    mode = holdingShot ? 'shot' : 'starting';
    playing = false;
    void openCameraStream(wanted).then((opened) => {
      if (cancelled) {
        stopCameraStream(opened);
        return;
      }
      live = opened;
      stream = opened;
      if (!opened) mode = 'unavailable';
      else if (!holdingShot) mode = 'live';
    });
    return () => {
      cancelled = true;
      stopCameraStream(live);
      stream = null;
    };
  });

  $effect(() => {
    if (video && video.srcObject !== stream) video.srcObject = stream;
  });

  /* Reset for the next opening once this one has gone. */
  function closed() {
    shot = null;
    facing = 'user';
  }

  /* The ghost and the shot, each as a one-deep stack so a change fades the
     old one out over the new one rather than blanking the box for a frame
     (memory: a blanked image is a yank). */
  let ghostUrls = $state<string[]>([]);
  $effect(() => {
    const name = open ? ghost?.fileName : undefined;
    if (!name) {
      ghostUrls = [];
      return;
    }
    let cancelled = false;
    void readPhoto(name).then((bytes) => {
      if (cancelled || !bytes) return;
      ghostUrls = [URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }))];
    });
    return () => {
      cancelled = true;
    };
  });

  let shotUrls = $derived(shot ? [URL.createObjectURL(new Blob([shot.full as BlobPart], { type: 'image/jpeg' }))] : []);

  async function take() {
    if (!video || mode !== 'live') return;
    try {
      shot = await captureFrame(video);
      mode = 'shot';
    } catch (error) {
      console.error('a progress photo frame could not be taken', error);
    }
  }

  function retake() {
    shot = null;
    mode = stream ? 'live' : 'starting';
  }

  /* Switching cameras fades the picture out first: the old stream has to
     stop before the other camera can open on most phones, and a picture
     that vanished in the frame its track stopped would be a yank. */
  let flipping = false;
  function flip() {
    if (flipping) return;
    flipping = true;
    playing = false;
    setTimeout(() => {
      flipping = false;
      facing = facing === 'user' ? 'environment' : 'user';
    }, med());
  }

  async function save(photo: NormalizedPhoto) {
    if (saving) return;
    saving = true;
    try {
      if ((await onSave(photo)) === false) return;
    } finally {
      saving = false;
    }
    onClose();
  }

  /* Without the in-app camera: the OS camera or a file, stored as soon as
     it comes back, the way a photo with no review is everywhere else. */
  async function fallbackCamera() {
    const photo = await capturePhoto();
    if (photo) await save(photo);
  }

  async function fallbackFile() {
    const [photo] = await pickPhotos(1);
    if (photo) await save(photo);
  }

  const fast = () => motionDuration('--dur-fast');
  const med = () => motionDuration('--dur-med');
  const swapIn = (node: Element) => crossfade(node, undefined, { direction: 'in' });
</script>

<Sheet {open} {title} {onClose} onClosed={closed} busy={saving}>
  <h3>{title}</h3>
  <div class="frame" data-progress-camera data-mode={mode}>
    <div class="layers">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={video}
        class:is-playing={playing}
        muted
        autoplay
        playsinline
        onplaying={() => (playing = true)}
        data-progress-video
      ></video>
      {#each ghostUrls as url (url)}
        <img
          class="ghost"
          src={url}
          alt=""
          data-progress-ghost
          in:fade={{ duration: med() }}
          out:fade={{ duration: fast() }}
          onoutroend={() => URL.revokeObjectURL(url)}
        />
      {/each}
    </div>
    {#each shotUrls as url (url)}
      <img
        class="shot"
        src={url}
        alt={m.photo_alt()}
        data-progress-shot
        in:fade={{ duration: fast() }}
        out:fade={{ duration: fast() }}
        onoutroend={() => URL.revokeObjectURL(url)}
      />
    {/each}
    {#if mode === 'unavailable'}
      <p class="unavailable" role="status" transition:fade={{ duration: fast() }}>{m.pph_camera_unavailable()}</p>
    {/if}
  </div>

  <p class="muted small hint">{ghost && mode !== 'unavailable' ? m.pph_ghost_hint() : m.pph_first_hint()}</p>

  <div class="controls">
    {#key mode === 'shot' ? 'shot' : mode === 'unavailable' ? 'fallback' : 'live'}
      <div class="control-row" in:swapIn out:crossfade>
        {#if mode === 'shot' && shot}
          <button class="btn btn-soft press" data-progress-retake onclick={retake}>{m.photo_review_retake()}</button>
          <button class="btn btn-primary press" data-progress-save disabled={saving} onclick={() => save(shot!)}>{m.pph_save()}</button>
        {:else if mode === 'unavailable'}
          <button class="btn btn-soft press" data-progress-file onclick={fallbackFile}>
            <Icon name="image" size={20} /><span>{m.add_photo()}</span>
          </button>
          <button class="btn btn-primary press" data-progress-native onclick={fallbackCamera}>
            <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
          </button>
        {:else}
          <button
            class="btn btn-soft press"
            data-progress-flip
            aria-label={m.pph_switch_camera()}
            onclick={flip}
          >
            <Icon name="repeat" size={20} />
          </button>
          <button class="btn btn-primary press" data-progress-take disabled={mode !== 'live' || !playing} onclick={take}>
            <Icon name="camera" size={20} /><span>{m.pph_take()}</span>
          </button>
        {/if}
      </div>
    {/key}
  </div>
</Sheet>

<style>
  .frame {
    position: relative;
    width: 100%;
    max-height: 60vh;
    aspect-ratio: 3 / 4;
    margin: var(--space-3) auto 0;
    border-radius: var(--r-block);
    overflow: clip;
    background: var(--surface-2);
  }
  /* Keeps the 3:4 when 60vh is the tighter bound, rather than squashing it. */
  @supports (aspect-ratio: 3 / 4) {
    .frame { width: min(100%, calc(60vh * 3 / 4)); }
  }
  .layers,
  .layers video,
  .ghost,
  .shot {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .layers video,
  .ghost,
  .shot {
    object-fit: cover;
    display: block;
  }
  /* Not mirrored, for either camera: the ghost is a stored shot, and a
     preview that flipped when the camera switched would flip the ghost with
     it or leave the two disagreeing. */
  .layers video {
    opacity: 0;
    transition: opacity var(--dur-med) var(--ease-out);
  }
  .layers video.is-playing { opacity: 1; }
  .ghost { opacity: 0.4; pointer-events: none; }
  .unavailable {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    text-align: center;
    color: var(--text-2);
  }
  .hint { margin: var(--space-3) 0; text-align: center; }
  /* The row keeps its height while its buttons change, and the leaving set
     is taken out of the flow by `crossfade`, so nothing below it moves. */
  .controls { position: relative; }
  .control-row {
    display: flex;
    gap: var(--space-2);
  }
  .control-row .btn-primary { flex: 1; }
</style>
