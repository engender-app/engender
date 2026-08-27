<script module lang="ts">
  /* One observer for every tile on the page, not one observer each.

     A browser delivers all of an observer's entries in a single callback,
     so a screenful of tiles crossing the margin together becomes one
     state flush and, downstream of that, one batched read in
     photoFiles.ts. Separate observers get separate callbacks with a
     microtask checkpoint between them, and the queue would drain once per
     tile - which is the batching this ticket added, undone.

     It lives on PhotoThumb rather than on the photo grid because a tile
     is what knows it is about to read: the timeline, the milestone list
     and the compare view would each need their own copy otherwise, and
     the implicit root already accounts for whichever ancestor is doing
     the scrolling.

     The margin is roughly a screenful, so scrolling arrives at a loaded
     tile rather than at a placeholder that then fills in - and it is why
     the root has to be the element that scrolls rather than the implicit
     viewport. A margin only widens the root's own rectangle; an ancestor
     that clips still clips at its real edge, so with the app shell
     scrolling (.app-main, app.css) the implicit root loaded a tile exactly
     as it appeared and the margin bought nothing. Found by walking up to
     the first scrollable ancestor rather than by naming the shell, so a
     tile in a probe page or a scrolling sheet gets the right one too. */
  const watchers = new Map<Element, (near: boolean) => void>();
  const observers = new Map<Element | null, IntersectionObserver>();

  function scrollRoot(target: Element): Element | null {
    for (let node = target.parentElement; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return node;
    }
    // Nothing in between scrolls, so the viewport is the root.
    return null;
  }

  function watchViewport(target: Element, onChange: (near: boolean) => void): () => void {
    const root = scrollRoot(target);
    let observer = observers.get(root);
    if (!observer) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) watchers.get(entry.target)?.(entry.isIntersecting);
        },
        { root, rootMargin: '400px' }
      );
      observers.set(root, observer);
    }
    watchers.set(target, onChange);
    observer.observe(target);
    return () => {
      watchers.delete(target);
      observer.unobserve(target);
    };
  }
</script>

<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import type { Photo } from '$lib/data/types';
  import { readThumbnail } from '$lib/stores/photoFiles';

  /* Renders a stored photo's thumbnail, never the full file: the Progress
     grid draws dozens of these at 104px, and decoding a 2048px JPEG for
     each would be the whole point of storing thumbnails, missed
     (ADR-0008).

     The gradient underneath is what shows while the bytes load, and what
     stays if there are none - a photo with no stored file (the demo
     persona's), or one whose file the sweep reclaimed. */
  let {
    photo,
    size = 72,
    label = '',
    bytes
  }: {
    /** `id` is optional because a draft the editor has not saved has none
        (types.ts: identity is minted on write, never in a screen). It only
        feeds the placeholder colour. */
    photo: Pick<Photo, 'fileName'> & { id?: string };
    size?: number;
    label?: string;
    /** Thumbnail bytes to draw instead of loading any: what the editors pass
        for a photo just picked, which has been normalized but has no stored
        file until the entry it belongs to is saved. */
    bytes?: Uint8Array;
  } = $props();

  let url = $state<string | null>(null);
  let element = $state<HTMLElement | null>(null);
  let near = $state(false);

  /* A tile reads nothing until it comes near the screen, and lets its
     bytes go once it is well past (phase 5 audit ticket 03, finding 04).
     A grid of hundreds of photos otherwise reads and decodes every one of
     them on mount and holds a blob URL and a decoded thumbnail for each,
     so the screen costs what the journal holds instead of what is on it. */
  $effect(() => {
    const target = element;
    if (!target) return;
    // No observer means no way to tell: draw everything, as before.
    if (typeof IntersectionObserver === 'undefined') {
      near = true;
      return;
    }
    return watchViewport(target, (visible) => {
      near = visible;
    });
  });

  /* Loading bytes and holding an object URL is exactly the external
     resource an effect is for: the URL has to be revoked when this
     unmounts or the photo changes, or a scrolling list leaks one blob per
     tile. Scrolling far away runs the same teardown, which is what keeps
     a grid's memory to what is on screen rather than to what has been. */
  $effect(() => {
    const given = bytes;
    const fileName = photo.fileName;
    const visible = near;
    url = null;
    // Given bytes are already in hand - a photo the editor just picked,
    // which has no stored file to read and nothing to gate.
    if (!given && !(fileName && visible)) return;

    let objectUrl: string | null = null;
    let stale = false;

    const thumbnail = given ? Promise.resolve(given) : readThumbnail(fileName!);
    thumbnail.then((loaded) => {
      if (stale || !loaded) return;
      objectUrl = URL.createObjectURL(new Blob([loaded as BlobPart], { type: 'image/jpeg' }));
      url = objectUrl;
    });

    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });

  /* A stable colour per photo, so the placeholder does not change shade
     between renders. Derived from the id rather than stored - it stands in
     for pixels nobody has loaded yet. Drafts have no id and all land on
     the same shade, which is what the editor showed before this and is
     only visible until ticket 08 gives them real files. */
  const hue = $derived(
    [...(photo.id ?? '')].reduce((h, character) => (h * 31 + character.charCodeAt(0)) % 360, 7)
  );
</script>

<div
  bind:this={element}
  class="photo-thumb"
  style:width="{size}px"
  style:height="{size}px"
  style:background="linear-gradient(135deg, hsl({hue} 45% 72%), hsl({(hue + 40) % 360} 40% 55%))"
  role={url ? 'presentation' : 'img'}
  aria-label={url ? undefined : label ? m.photo_placeholder_labelled({ label }) : m.photo_placeholder()}
>
  {#if url}
    <img src={url} alt={label || m.photo_alt()} />
  {:else}
    <Icon name="image" size={Math.min(28, size / 2.5)} />
  {/if}
  {#if label}<span class="photo-label">{label}</span>{/if}
</div>
