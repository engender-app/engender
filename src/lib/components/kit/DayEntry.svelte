<script lang="ts">
  /* One entry inside a day card: when it was written, how it felt, and what
     it says.

     The day reads as a timeline rather than as a stack of rows. A hairline
     runs down the entries and each mood sits on it, so the shape of a day -
     three entries close together in the evening, one in the morning - is
     visible before a word of it is read. The times sit beside the marks
     rather than inside the text, which is what keeps the rail readable as a
     clock.

     The mood is the same face the picker offers, at entry size. A mood that
     is chosen as a face and read back as a coloured dot is two moods.

     It opens where it is given somewhere to open (phase 5 ticket 21, its
     first real screen): an entry that can be read back and not opened is a
     dead end, and the surface that draws an entry is the one that owes the
     link. Presentational where it is not, because a day card printed into
     the journal book has nowhere to go.

     Under the note sits what the entry carries besides its words: the tags
     it was filed under, and a mark for a photo, a recording or a video. An
     entry list that shows only the note makes an entry that is a photo and
     four tags look like an empty one, and this is a summary of a day rather
     than a preview of one field of it. Tags arrive resolved to labels, and
     marks as icon names, because which tags exist and what a photo is are
     both the journal's business and not this surface's.

     The handles are the app's own - `data-entry-card` for the row and
     `data-entry-note` for its note - rather than a second vocabulary for
     the thing EntryCard already carries on search, on a day and on the
     timeline (ADR-0029). Same concept, same handle, whichever surface it is
     drawn on.

     Where it opens, it is also the source half of the app's one container
     transform (DIRECTION.md tier 2, wired by ticket 22): the row the finger
     lands on is the box the editor grows out of. Whether that runs at all
     belongs to the navigation and to $lib/motion/container.svelte, not here
     - this only says which row was tapped, and only while it has somewhere
     to go. */
  import Icon from '../Icon.svelte';
  import MoodFace from '../MoodFace.svelte';
  import { entryContainerName, opensHere, openEntryContainer } from '$lib/motion/container.svelte';

  let {
    time,
    mood,
    title,
    note,
    tags,
    marks,
    href,
    key
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
    /** Where the entry opens. Omitted, the row is a plain article. */
    href?: string;
    key?: string;
  } = $props();
</script>

{#snippet body()}
  <span class="kit-entry-time">{time}</span>
  <span class="kit-entry-mark">
    {#if mood}<MoodFace step={mood} size={28} />{:else}<i class="kit-entry-nomood"></i>{/if}
  </span>
  <div class="kit-entry-body">
    {#if title}<b class="kit-entry-title">{title}</b>{/if}
    {#if note}<p class="kit-entry-note" data-entry-note>{note}</p>{/if}
    {#if tags?.length || marks?.length}
      <span class="kit-entry-meta">
        {#each marks ?? [] as mark (mark)}<Icon name={mark} size={16} />{/each}
        {#each tags ?? [] as tag (tag)}<span class="kit-pill">{tag}</span>{/each}
      </span>
    {/if}
  </div>
{/snippet}

{#if href}
  <a
    class="kit-entry"
    data-entry-card={key}
    {href}
    style:view-transition-name={entryContainerName(key)}
    onclick={(event) => { if (key && opensHere(event)) openEntryContainer(key); }}>{@render body()}</a
  >
{:else}
  <article class="kit-entry" data-entry-card={key}>{@render body()}</article>
{/if}
