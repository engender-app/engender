<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import type { ReferencePhoto } from '$lib/stores/photoPicking';
  import { readPhoto } from '$lib/stores/photoFiles';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Slider from './Slider.svelte';

  /* The compare-and-retake step ticket 12 asks for instead of a live camera
     overlay (ADR-0033): once the native camera intent returns a shot, this is
     where the person judges it against their last photo before anything is
     ever written to storage. Retaking re-invokes the same native capture -
     there is no camera surface here, only two already-decoded photos and a
     slider. */

  let {
    photo,
    reference,
    onAccept,
    onRetake,
    onCancel
  }: {
    /** The shot just captured, waiting for a decision. Null keeps the sheet
        closed. */
    photo: NormalizedPhoto | null;
    /** The default comparison photo - the last one from whatever context the
        capture was invoked from - or null the first time there is nothing yet
        to align against. */
    reference: ReferencePhoto | null;
    onAccept: (photo: NormalizedPhoto) => void;
    onRetake: () => void;
    onCancel: () => void;
  } = $props();

  const DEFAULT_OPACITY = 50;
  let opacity = $state(DEFAULT_OPACITY);

  /* Every new shot starts centred, rather than keeping whatever position a
     previous review left the slider at - a retake compares against the same
     reference, but the last opacity chosen said nothing about this shot. */
  $effect(() => {
    if (photo) opacity = DEFAULT_OPACITY;
  });

  let newUrl = $state<string | null>(null);
  $effect(() => {
    if (!photo) {
      newUrl = null;
      return;
    }
    const url = URL.createObjectURL(new Blob([photo.full as BlobPart], { type: 'image/jpeg' }));
    newUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  /* Full resolution, not the thumbnail PhotoThumb reads elsewhere: aligning
     a retake against a 320px-wide reference would show less than the person
     is trying to check. */
  let referenceUrl = $state<string | null>(null);
  $effect(() => {
    referenceUrl = null;
    if (!reference) return;

    if ('bytes' in reference) {
      const url = URL.createObjectURL(new Blob([reference.bytes as BlobPart], { type: 'image/jpeg' }));
      referenceUrl = url;
      return () => URL.revokeObjectURL(url);
    }

    let objectUrl: string | null = null;
    let stale = false;
    readPhoto(reference.fileName).then((bytes) => {
      if (stale || !bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
      referenceUrl = objectUrl;
    });
    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

<Sheet open={photo !== null} title={m.photo_review_title()} onClose={onCancel}>
  {#if photo}
    <h3>{m.photo_review_title()}</h3>
    <div class="onion-frame">
      {#if referenceUrl}
        <img src={referenceUrl} alt="" class="onion-layer" />
      {/if}
      {#if newUrl}
        <img
          src={newUrl}
          alt={m.photo_alt()}
          class="onion-layer"
          style:opacity={referenceUrl ? opacity / 100 : 1}
        />
      {/if}
    </div>
    {#if referenceUrl}
      <!-- The app's slider, not a native range: this was the one live
           input[type="range"] left, and it carried no thumb styling at all,
           so both engines drew their own control here. -->
      <span class="field-label" id="photo-review-opacity-label">
        {m.photo_review_compare_label()}
      </span>
      <div class="onion-opacity" data-onion-opacity>
        <Slider
          value={opacity}
          onInput={(v) => (opacity = v)}
          label={m.photo_review_compare_label()}
          labelledBy="photo-review-opacity-label"
        />
      </div>
    {/if}
    <div class="stack-3">
      <button class="btn btn-primary" data-use-photo onclick={() => onAccept(photo)}>
        <Icon name="check" size={18} /><span>{m.photo_review_use()}</span>
      </button>
      <button class="btn btn-soft" data-retake-photo onclick={onRetake}>
        <Icon name="camera" size={18} /><span>{m.photo_review_retake()}</span>
      </button>
    </div>
  {/if}
</Sheet>
