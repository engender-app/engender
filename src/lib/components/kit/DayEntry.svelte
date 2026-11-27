<script lang="ts">
  /* The day card's hairline, mood faces and timestamps form the entry
     timeline. Tags arrive as labels and media marks as icon names. Render
     them beside the note so a media-only entry still shows what it holds.

     A missing note has its own labelled placeholder. Reserve
     data-entry-note for actual notes and data-entry-card for the row
     (ADR-0029). The row owns the placeholder's copy.

     A caller that supplies a destination makes the row a link. A printed
     day card stays presentational. When the row opens, its measured box
     is the source of the container transform. Navigation and
     motion/container.svelte decide when the transform runs. */
  import type { Snippet } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import Icon from '../Icon.svelte';
  import MoodFace from '../MoodFace.svelte';
  import { entryContainerName, opensHere, openEntryContainer } from '$lib/motion/container.svelte';
  import { page } from '$app/state';
  import { withListReturn } from '$lib/navigation/sourceRecord';
  import type { EntryPresentationLabel } from '$lib/data/vocabulary/entryPresentation';

  let {
    time,
    mood,
    title,
    note,
    tags,
    marks,
    presentation,
    href,
    key,
    clampNote = true,
    marginNotes
  }: {
    /** Already formatted against the active locale by the caller. */
    time: string;
    /** 1 to 5, or null for an entry logged without one. */
    mood?: number | null;
    title?: string;
    note?: string;
    /** Already resolved to labels by the caller: the vocabulary is what
        turns a built-in tag's key into a word, and it does it once. */
    tags?: string[];
    /** Icon names for the media the entry holds - a photo, a recording, a
        video note. */
    marks?: string[];
    /** The fluidity engine's presentation (ADR-0048), already resolved to a name and an ink colour by the
        caller - the same reason `tags` arrives as labels rather than ids.
        Absent for an entry that carries none, which shows nothing at all:
        absence, not a label. */
    presentation?: EntryPresentationLabel;
    /** Where the entry opens. Omitted, the row is a plain article. */
    href?: string;
    key?: string;
    /** Off for a run of entries meant to be read rather than scanned
         - the note prints in full instead of
        clamping to two lines. Every other caller leaves this on, which is
        what keeps a day card the same height whatever somebody wrote. */
    clampNote?: boolean;
    /** A margin note is content about this entry rather than of it, so it is a snippet the caller supplies rather
        than a prop this component reads a journal for - the same
        presentational rule `tags`/`marks`/`presentation` already keep,
        applied to a caller that also writes, not only reads. Rendered
        inside this row's own `.kit-entry-body` rather than as a sibling
        row, so the timeline rail above - which counts on being the only
        thing in a day card and reaches for `:first-child`/`:last-child` -
        never has to know a margin note exists. Omitted everywhere this
        component is drawn without the reading-room surfaces around it
        (Home, on-this-day): nothing there changes. */
    marginNotes?: Snippet;
  } = $props();
</script>

{#snippet body()}
  <span class="kit-entry-time">{time}</span>
  <span class="kit-entry-mark">
    {#if mood}<MoodFace step={mood} size={28} />{:else}<i class="kit-entry-nomood"></i>{/if}
  </span>
  <div class="kit-entry-body">
    {#if title}<b class="kit-entry-title">{title}</b>{/if}
    {#if presentation}
      <span class="kit-entry-presentation" data-entry-presentation style="color: {presentation.color}">{presentation.name}</span>
    {/if}
    {#if note}
      <p class="kit-entry-note" class:is-full={!clampNote} data-entry-note>{note}</p>
    {:else}
      <p class="kit-entry-note is-absent" data-entry-no-note>{m.entry_no_note()}</p>
    {/if}
    {#if tags?.length || marks?.length}
      <span class="kit-entry-meta">
        {#each marks ?? [] as mark}<Icon name={mark} size={16} />{/each}
        {#each tags ?? [] as tag}<span class="kit-pill" data-entry-tag>{tag}</span>{/each}
      </span>
    {/if}
  </div>
{/snippet}

{#if href}
  <!-- The transition name lives on `.kit-entry-bg`, not on this element: a view transition
       captures a named element as one rasterised image and scales it 4-8x into a full
       screen, and a row's note text riding inside that image read as a heading-sized
       blow-up. The plain fill grows; the content crossfades with the screen. -->
  <a
    class="kit-entry"
    data-entry-card={key}
    data-no-press
    href={withListReturn(href, page.url)}
    onclick={(event) => { if (key && opensHere(event)) openEntryContainer(key); }}
  >
    <span class="kit-entry-bg" style:view-transition-name={entryContainerName(key)}></span>
    {@render body()}
  </a>
{:else}
  <article class="kit-entry" data-entry-card={key}>{@render body()}</article>
{/if}

{#if marginNotes}
  <!-- A sibling of `.kit-entry`, not nested in it: a margin note's own
       controls are buttons, and `.kit-entry` is the row's whole press
       target when `href` is set - interactive content has no business
       inside an `<a>`. Indented past the mood rail so it reads as
       attached to the entry above rather than as the day card's next row
       (kit.css's `:first-of-type`/`:last-of-type` fix is the rail's own
       half of this). -->
  <div class="kit-entry-annotations">{@render marginNotes()}</div>
{/if}

<style>
  /* Two lines of the note, then an ellipsis. Here rather than in kit.css:
     this component is its one reader (check-screens-classes). */
  .kit-entry-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* No note. Italic, and nothing else: it reads as the row saying something
     about itself rather than as words somebody wrote. It keeps the note's
     own --text-2 rather than stepping quieter, because it is still text
     somebody reads and the palette contrast test holds --text-2 to the
     4.5:1 floor across every palette - a paler grey invented here would
     answer to nothing. */
  .kit-entry-note.is-absent {
    font-style: italic;
  }

  /* A run of entries meant to be read rather than scanned: the same row, the whole note. */
  .kit-entry-note.is-full {
    display: block;
    -webkit-line-clamp: unset;
    line-clamp: unset;
    overflow: visible;
  }

  .kit-entry-annotations {
    padding: 0 var(--space-4) var(--space-2) calc(var(--space-4) + 26px + var(--space-3));
  }
</style>
