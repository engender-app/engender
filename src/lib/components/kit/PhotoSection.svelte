<script lang="ts" generics="TPhoto extends { id: string; fileName: string | null }">
  /* The rows, the add control, the confirm sheet and the alignment review
     every photo-owning screen assembled for itself (phase 5 audit
     ticket 11) - the visual half of photoSection.svelte.ts, used by the
     screens whose photos are a plain list under a thumbnail row. A
     milestone's photo is a single one held in its own draft with its own
     remove-and-replace markup, so it wires the logic module directly
     rather than through this surface (milestones/+page.svelte).

     The row's own handle and the delete button's come from `handle` via
     recordHandles.ts (ADR-0029) - `data-${handle}` for the row, the same
     literal every screen already wrote by hand, and `handles.delete` for
     the trash action, which RecordSheet's confirm sheet already uses for
     its own button. The add control's handle is not slug'd: it is the one
     new walkthrough vocabulary this ticket adds, a single `data-add-photo`
     literal shared by all five screens rather than five different names,
     since only one add control is ever on screen at a time. */
  import type { Snippet } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import type { LiveList } from '$lib/data/live/journal.svelte';
  import type { Role } from '$lib/theme/roles';
  import Icon from '../Icon.svelte';
  import PhotoThumb from '../PhotoThumb.svelte';
  import PhotoAlignmentReview from '../PhotoAlignmentReview.svelte';
  import ListCard from './ListCard.svelte';
  import ListRow from './ListRow.svelte';
  import ReadGate from './ReadGate.svelte';
  import RecordSheet from './RecordSheet.svelte';
  import { recordHandles } from './recordHandles';
  import type { photoSection } from './photoSection.svelte';

  let {
    section,
    read,
    role,
    handle,
    confirm,
    title,
    subtitle,
    deleteLabel,
    reverse = false,
    empty,
    addControl
  }: {
    /** The screen's own `photoSection(...)`. Every sheet and the review
        below read their state from it. */
    section: ReturnType<typeof photoSection<TPhoto>>;
    /** The same liveList query `section` reads `photos` off of, so the
        gate and the module never disagree about what "loading" means. */
    read: LiveList<TPhoto>;
    role?: Role;
    /** What this screen calls its photos, in kebab case - `procedure-photo`,
        `tryout-photo`. */
    handle: string;
    confirm: {
      title: string;
      question: (target: TPhoto) => string;
      hint?: (target: TPhoto) => string | null;
      confirmLabel: string;
      cancelLabel: string;
    };
    /** A row's own line, where a photo carries one - a hair stage photo's
        date. Most owners have nothing to say here beyond the thumbnail. */
    title?: (photo: TPhoto) => string;
    subtitle?: (photo: TPhoto) => string | null | undefined;
    /** The row's own delete button, worded the way this screen already
        does - a date, or a plain constant. */
    deleteLabel: (photo: TPhoto) => string;
    /** Newest first. The list itself, and what "last" means for the
        alignment review's reference, stay oldest-first (photoSection.ts) -
        this only flips which end the rows are drawn from. */
    reverse?: boolean;
    empty: Snippet;
    /** Replaces the default pick-and-capture button pair, for the one
        screen whose add control opens a date sheet first
        (surgery/+page.svelte). Still carries `data-add-photo` itself, so
        the walkthrough grips one name whichever markup renders it. */
    addControl?: Snippet;
  } = $props();

  const handles = $derived(recordHandles(handle));

  function rowHandle(photoId: string): Record<string, string> {
    return { [`data-${handle}`]: photoId };
  }

  function deleteAction(photo: TPhoto) {
    return {
      icon: 'trash',
      label: deleteLabel(photo),
      onclick: () => section.record.askToDelete(photo),
      attrs: { [handles.delete]: photo.id }
    };
  }
</script>

{#if addControl}
  {@render addControl()}
{:else}
  <div class="photo-row" style="margin-bottom:var(--space-3)">
    <button class="photo-add" data-add-photo aria-label={m.add_photo()} onclick={section.pick}>
      <Icon name="image" size={20} /><span>{m.add_photo()}</span>
    </button>
    <button class="photo-add" data-capture-photo aria-label={m.add_photo_camera()} onclick={section.review.capture}>
      <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
    </button>
  </div>
{/if}

<ReadGate {read} variant="line" count={1} rows={photoRows} {empty} />

{#snippet photoRows(photos: TPhoto[])}
  <div style="margin-bottom:var(--space-3)">
    <ListCard {role}>
      {#each reverse ? [...photos].reverse() : photos as photo (photo.id)}
        {@const rowAttrs = rowHandle(photo.id)}
        <ListRow static {...rowAttrs} title={title?.(photo)} subtitle={subtitle?.(photo)} action={deleteAction(photo)}>
          {#snippet leading()}<PhotoThumb {photo} size={48} />{/snippet}
        </ListRow>
      {/each}
    </ListCard>
  </div>
{/snippet}

<RecordSheet record={section.record} {handle} {confirm} />

<PhotoAlignmentReview
  photo={section.review.photo}
  reference={section.review.reference}
  onAccept={section.review.accept}
  onRetake={section.review.capture}
  onCancel={section.review.cancel}
/>
