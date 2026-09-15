<script lang="ts" generics="TPhoto extends { id: string; epochDay: number; fileName: string | null }">
  /* Two photographs of the same body months apart, in one frame, with one
     draggable divider between them (phase 10 redesign ticket 55).

     What this replaces on both of its callers is a two-up grid: two
     half-width thumbnails side by side, which at 390px is about 170px of
     picture each and is the hardest possible way to see what changed. A
     wipe puts both photographs at full width in the same frame, so the eye
     compares the same pixels in the same place instead of travelling
     between two small pictures and holding one of them in memory.

     The reference is Photoroom's before/after (Mobbin, iOS,
     https://mobbin.com/screens/c81968f1-67c1-4652-bd13-bf8595e8605c): one
     frame, a hard divider, no crossfade and no verdict. Taken from it: the
     divider is a line rather than a soft blend, because a blend invents
     pixels that are in neither photograph. Not taken: its round white
     handle with a shadow, which is the iOS material DIRECTION.md's rule 10
     refuses - the handle here is a flat block of the area's own stripe.
     The two dates pinned to the frame's top corners are Hers'
     (https://mobbin.com/screens/dc7b6682-eff4-4591-be82-a6d5d9fd6f62),
     where "Month 0" and "Month 6" sit on the pictures rather than under
     them, which is what keeps both of them readable at every divider
     position.

     Colour never judges here and nothing about the drawing says which of
     the two photographs is better (ADR-0012). The wipe shows two
     photographs; the person reads them.

     Full bytes, not thumbnails: a stored thumbnail is 320px on its long
     edge (normalize.ts), and this frame is 358px wide on a phone at 1x and
     more than a thousand device pixels at 3x. The whole point of the screen
     is that the two pictures are the same pixels, so a blurred pair would
     miss it. Two deliberate reads of two photographs, which is what
     readPhoto is for (photoFiles.ts). */
  import { m } from '$lib/paraglide/messages';
  import type { ComparePair, CompareSide } from '$lib/data/photos/compare-state';
  import { stepPair } from '$lib/data/photos/compare-state';
  import { readPhoto } from '$lib/stores/photoFiles';
  import { fade } from 'svelte/transition';
  import { motionDuration } from '$lib/motion/tokens';
  import type { Role } from '$lib/theme/roles';
  import Icon from '../Icon.svelte';
  import PhotoThumb from '../PhotoThumb.svelte';
  import { roleAttrs } from './role';
  import { cropDiffers, fractionAt, fractionForKey, type PhotoShape } from './photoWipe';

  let {
    photos,
    pair,
    onPair,
    date,
    note,
    role
  }: {
    /** The list both indices of `pair` point into, oldest first. */
    photos: TPhoto[];
    /** Which two are being compared: `left` is the earlier photograph and
        `right` the later one, always. */
    pair: ComparePair;
    /** A press of one of the four earlier/later controls. The caller owns
        the pair, because on one screen it comes from a selection grid and
        on the other from this control alone. */
    onPair: (next: ComparePair) => void;
    /** The date block pinned to that photograph's corner of the frame. */
    date: (photo: TPhoto) => string;
    /** That side's own line under the frame - what the photograph belongs
        to, or how long after the start it was taken. Null where this
        screen has nothing to say about it. */
    note?: (photo: TPhoto) => string | null;
    role?: Role;
  } = $props();

  const earlier = $derived(photos[pair.left]);
  const later = $derived(photos[pair.right]);

  /* Where the divider stands, 0 (all later) to 1 (all earlier). Kept across
     a change of either photograph: stepping to the next month is a question
     about the same comparison, so putting the divider back to the middle
     would undo the thing the person was in the middle of looking at. */
  let fraction = $state(0.5);
  let dragging = $state(false);
  let frame = $state<HTMLElement | null>(null);

  /** The wipe needs pixels on both sides. A photo row with no stored file
      is the demo persona's placeholder, or one whose file the orphan sweep
      reclaimed (ADR-0008, types.ts), and wiping between two gradients shows
      nothing - so those two go side by side instead, which is what this
      screen drew before this control existed. Decided from the row rather
      than from the bytes, so the frame never changes shape after it has
      been drawn. */
  const wipeable = $derived(earlier?.fileName !== null && later?.fileName !== null);

  /* Each side is a one-deep stack rather than a single src, and replacing
     the entry is what crossfades the two photographs.

     Blanking the side and then filling it back in was the first attempt,
     and it is a yank of the worst kind: a step to another month left the
     plate holding neither photograph for as long as the read took - one
     frame at 17ms in the recording, and as long as a decode on a real
     phone. Nothing is cleared now. The photograph that was there is
     dropped from the stack in the same breath the new one is pushed, and
     Svelte keeps its node alive for the length of its own outro, so the
     two overlap and no frame is left with neither. The surface under them
     never moves, which is the other half of the rule: a surface stays one
     object and its content is what crossfades. */
  let earlierStack = $state<string[]>([]);
  let laterStack = $state<string[]>([]);
  let earlierShape = $state<PhotoShape | null>(null);
  let laterShape = $state<PhotoShape | null>(null);

  /* Every object URL this frame has minted. An <img> revokes its own as
     its outro ends, which is the common path; this is what catches the
     ones whose node went without one - the side-by-side fallback taking
     over, or the screen being left. Revoking twice is a no-op, so the two
     paths need not agree about which of them got there first. */
  const minted: string[] = [];

  /* One read per side, abandoned if the side changes under it. */
  function load(fileName: string | null, show: (url: string) => void): (() => void) | undefined {
    if (!fileName || !wipeable) return;

    let stale = false;
    readPhoto(fileName).then(
      (bytes) => {
        if (stale || !bytes) return;
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
        minted.push(url);
        show(url);
      },
      // A file written under another key throws out of the store rather
      // than reading as null (encrypted-file-store.ts). The plate is
      // already showing what it was showing, so there is nothing to do.
      () => {}
    );

    return () => {
      stale = true;
    };
  }

  $effect(() => load(earlier?.fileName ?? null, (url) => (earlierStack = [url])));
  $effect(() => load(later?.fileName ?? null, (url) => (laterStack = [url])));

  /* Nothing tracked in the body, so this runs once and its teardown is the
     screen being left. Svelte skips outros when a component is destroyed,
     so the <img>'s own revoke never fires on that path. */
  $effect(() => () => {
    for (const url of minted) URL.revokeObjectURL(url);
  });

  /** How this frame reconciled two photographs of different shapes, said
      out loud rather than left for the person to notice. Both are cropped
      to the frame from the middle and neither is stretched; the note
      appears only when there is actually a difference to explain
      (photoWipe.ts). */
  const cropStated = $derived(cropDiffers(earlierShape, laterShape));

  function shapeOf(event: Event): PhotoShape | null {
    const image = event.currentTarget;
    if (!(image instanceof HTMLImageElement)) return null;
    return { width: image.naturalWidth, height: image.naturalHeight };
  }

  /* The divider is grabbed by its own strip and moves by how far the
     pointer has travelled since, not to wherever the pointer is: grabbing
     48px of handle 20px off its centre would otherwise slide the divider
     20px on the first frame, which is the one thing a wipe must not do.
     Release changes nothing at all, for the same reason. */
  let grabOffset = 0;

  function frameBox(): { left: number; width: number } {
    const box = frame?.getBoundingClientRect();
    return { left: box?.left ?? 0, width: box?.width ?? 0 };
  }

  function grab(event: PointerEvent) {
    const box = frameBox();
    grabOffset = event.clientX - (box.left + fraction * box.width);
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent) {
    if (!dragging) return;
    fraction = fractionAt(event.clientX - grabOffset, frameBox());
  }

  function release() {
    dragging = false;
  }

  function key(event: KeyboardEvent) {
    const next = fractionForKey(event.key, fraction);
    if (next === null) return;
    event.preventDefault();
    fraction = next;
  }

  function step(side: CompareSide, delta: -1 | 1) {
    const next = stepPair(pair, side, delta, photos.length);
    if (next) onPair(next);
  }

  const percent = $derived(Math.round(fraction * 100));

  /* Every side's controls ask the same question the press itself asks, so a
     control that can be pressed and a press that does nothing cannot
     disagree (compare-state.ts). */
  const steps = $derived([
    { side: 'left' as const, photo: earlier, back: stepPair(pair, 'left', -1, photos.length), forward: stepPair(pair, 'left', 1, photos.length), backLabel: m.photo_wipe_earlier_back(), forwardLabel: m.photo_wipe_earlier_forward() },
    { side: 'right' as const, photo: later, back: stepPair(pair, 'right', -1, photos.length), forward: stepPair(pair, 'right', 1, photos.length), backLabel: m.photo_wipe_later_back(), forwardLabel: m.photo_wipe_later_forward() }
  ]);
</script>

<div class="wipe" data-photo-wipe {...roleAttrs(role)}>
  {#if wipeable}
    <div class="wipe-frame" class:is-dragging={dragging} bind:this={frame} style:--wipe-at={fraction}>
      <div class="wipe-plate">
        {#each laterStack as url (url)}
          <img
            class="wipe-photo"
            src={url}
            alt={m.ph_cell_aria({ date: date(later) })}
            onload={(event) => (laterShape = shapeOf(event))}
            in:fade={{ duration: motionDuration('--dur-fast') }}
            out:fade={{ duration: motionDuration('--dur-fast') }}
            onoutroend={() => URL.revokeObjectURL(url)}
          />
        {/each}
      </div>
      <div class="wipe-plate is-earlier">
        {#each earlierStack as url (url)}
          <img
            class="wipe-photo"
            src={url}
            alt={m.ph_cell_aria({ date: date(earlier) })}
            onload={(event) => (earlierShape = shapeOf(event))}
            in:fade={{ duration: motionDuration('--dur-fast') }}
            out:fade={{ duration: motionDuration('--dur-fast') }}
            onoutroend={() => URL.revokeObjectURL(url)}
          />
        {/each}
      </div>

      <span class="wipe-date is-earlier" data-wipe-date="left">{date(earlier)}</span>
      <span class="wipe-date is-later" data-wipe-date="right">{date(later)}</span>

      <div
        class="wipe-handle"
        data-wipe-handle
        role="slider"
        tabindex="0"
        aria-label={m.photo_wipe_handle()}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={m.photo_wipe_value({ percent })}
        onpointerdown={grab}
        onpointermove={drag}
        onpointerup={release}
        onpointercancel={release}
        onkeydown={key}
      >
        <span class="wipe-line"></span>
        <span class="wipe-grip">
          <Icon name="chevronLeft" size={14} />
          <Icon name="chevronRight" size={14} />
        </span>
      </div>
    </div>
  {:else}
    <!-- Nothing to wipe between, so the two photographs go side by side
         and each keeps its own date under it. -->
    <div class="wipe-pair" data-wipe-fallback>
      {#each [earlier, later] as photo, i (photo.id)}
        <div class="wipe-half">
          <PhotoThumb {photo} size={150} />
          <span class="wipe-half-date" data-wipe-date={i === 0 ? 'left' : 'right'}>{date(photo)}</span>
        </div>
      {/each}
    </div>
    <p class="wipe-note" data-wipe-fallback-note>{m.photo_wipe_no_file()}</p>
  {/if}

  {#if cropStated}
    <p class="wipe-note" data-wipe-crop-note>{m.photo_wipe_crop()}</p>
  {/if}

  <div class="wipe-steps">
    {#each steps as group (group.side)}
      <div class="wipe-step" data-wipe-step={group.side}>
        <span class="wipe-step-note">{note?.(group.photo) ?? ''}</span>
        <span class="wipe-step-controls">
          <button
            class="icon-btn press"
            data-wipe-back={group.side}
            disabled={!group.back}
            aria-label={group.backLabel}
            onclick={() => step(group.side, -1)}
          >
            <Icon name="chevronLeft" size={18} />
          </button>
          <button
            class="icon-btn press"
            data-wipe-forward={group.side}
            disabled={!group.forward}
            aria-label={group.forwardLabel}
            onclick={() => step(group.side, 1)}
          >
            <Icon name="chevronRight" size={18} />
          </button>
        </span>
      </div>
    {/each}
  </div>
</div>

<style>
  /* Registered, or the divider cannot travel. A bare custom property
     animates as a string and swaps at the halfway point, so a key press
     would cut the divider from where it was to where it is going - which
     is the one movement this control is not allowed to make. Registered, it
     is a number the browser walks, and both the handle and the clip read
     the same walk. (NoticedAxis.svelte's `--at` and kit.css's `--level` are
     the same move.) */
  @property --wipe-at {
    syntax: '<number>';
    inherits: true;
    initial-value: 0.5;
  }

  /* Its own container, because both things below that can run out of room
     run out of room against this control's width rather than the screen's:
     it is half as wide again on a tablet (below) as on a phone. */
  .wipe {
    container: wipe / inline-size;
  }

  /* A block (rule 4): 6px corners and its own --outline edge, so the frame
     is visible on both themes before any photograph has decoded. No
     shadow - the kit has none and this is not where one starts. */
  .wipe-frame {
    position: relative;
    aspect-ratio: 3 / 4;
    border-radius: var(--r-block);
    border: 1px solid var(--outline);
    overflow: hidden;
    touch-action: none;
    transition: --wipe-at var(--dur-fast) var(--ease-out);
  }

  /* A finger has to be followed exactly. Anything between the pointer and
     the divider reads as lag rather than as easing, so the transition above
     is for the keyboard and for a change of photograph only. */
  .wipe-frame.is-dragging {
    transition: none;
  }

  .wipe-plate {
    position: absolute;
    inset: 0;
  }

  /* The earlier photograph is the one that is clipped, so the divider
     uncovers the later one as it travels right to left - the journey runs
     the way the frame's two dates read, left to right. */
  .wipe-plate.is-earlier {
    clip-path: inset(0 calc(100% - var(--wipe-at) * 100%) 0 0);
  }

  /* Both photographs are cropped to this one frame from the middle and
     neither is stretched, which is what .wipe-note says out loud when the
     two shapes actually differ. */
  .wipe-photo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  /* Pinned to the frame rather than placed under it, so both dates are
     readable wherever the divider stands. A block of the area's own stripe
     with the ink that stripe carries (rule 4, role.ts). */
  .wipe-date {
    position: absolute;
    /* Over the divider rather than under it. The line is the same colour
       as these blocks, so a divider standing behind one read as the block
       being cut in half. `pointer-events: none` because a label must not
       take the top of the divider's grab strip away from it. */
    z-index: 1;
    pointer-events: none;
    padding: 2px var(--space-2);
    border-radius: var(--r-block);
    background: var(--role-draw);
    /* A block's edge, drawn inside, the way every other block in the kit
       draws it (rule 4): a white band on a pale photograph and a near-black
       one on a dark photograph are otherwise a block with no boundary. */
    border: 1px solid var(--outline);
    color: var(--role-fill-ink);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
  }

  /* Opposite corners rather than both along the top, so the two can never
     collide however long the dates are or however narrow the frame gets.
     Side by side they do collide: at 200% zoom the frame is 145px and
     "16 September 2025" alone is 126 of it, and two long dates overlap
     even at 320px. A diagonal also reads the way the comparison does -
     the earlier one where the frame starts, the later one where it
     ends. */
  .wipe-date.is-earlier {
    top: var(--space-2);
    left: var(--space-2);
  }

  .wipe-date.is-later {
    bottom: var(--space-2);
    right: var(--space-2);
  }

  /* 48px of grab, which is the app's touch floor, centred on a 3px line.
     The strip is the control and the line is what it draws; splitting them
     is what lets the target clear the floor without a 48px bar across two
     photographs. */
  .wipe-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--wipe-at) * 100%);
    width: var(--touch-target);
    margin-left: calc(var(--touch-target) / -2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ew-resize;
    touch-action: none;
  }

  /* The stripe between two hairlines of the ink that stripe carries, which
     is what keeps the seam readable over any two photographs: a bare 3px
     of one colour disappears wherever the picture happens to be near it,
     and a photograph is not a surface whose colour this control gets to
     choose. Two hairlines rather than a shadow, which the kit does not
     have. */
  .wipe-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--role-draw);
    border-left: 1px solid var(--role-fill-ink);
    border-right: 1px solid var(--role-fill-ink);
  }

  .wipe-grip {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 2px;
    border-radius: var(--r-block);
    background: var(--role-draw);
    border: 1px solid var(--outline);
    color: var(--role-fill-ink);
  }

  .wipe-handle:focus-visible {
    outline: none;
  }

  .wipe-handle:focus-visible .wipe-grip {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* The fallback: the two-up grid this control replaced, kept for the one
     case it cannot serve. `.photo-thumb` is PhotoThumb's own class, so it
     needs :global() from here - and it has to be reached, because the
     shared rule sizes a thumbnail by a fixed pixel width and each half of
     this grid is half a screen wide. */
  .wipe-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }

  .wipe-half {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .wipe-half :global(.photo-thumb) {
    width: 100% !important;
    aspect-ratio: 3 / 4;
    height: auto !important;
  }

  .wipe-half-date {
    font-size: var(--text-xs);
    color: var(--text-2);
  }

  .wipe-note {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  /* One group per side, under the half of the frame it moves: that side's
     own line, and its two controls under it.

     A column rather than the `< note >` row the two-up grid used. In a row
     the note is squeezed to about 90px between the two controls, which
     wraps "19 weeks from the start" onto three lines; and the four
     controls come out as one run of chevrons across the screen, with the
     earlier side's "one further on" 60px from the later side's "one
     further back" and nothing between them saying which photograph either
     moves. Stacked, each note gets the whole half and each pair reads as
     one control. */
  .wipe-steps {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .wipe-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .wipe-step-note {
    text-align: center;
    font-size: var(--text-xs);
    color: var(--text-2);
  }

  .wipe-step-controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  /* Two 48px targets and the gap between them are 104px, so below about
     215px of control the two groups stop fitting side by side and the row
     pushes the page sideways. At 200% zoom that is exactly where this
     lands. One group per line there; neither target shrinks, because the
     48px floor is not negotiable (base.css). */
  @container wipe (max-width: 240px) {
    .wipe-steps {
      grid-template-columns: 1fr;
    }
  }

  @container app (min-width: 1024px) {
    .wipe {
      max-width: 560px;
      margin-left: auto;
      margin-right: auto;
    }
  }
</style>
