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
     is chosen as a face and read back as a coloured dot is two moods. */
  import MoodFace from './MoodFace.svelte';

  let {
    time,
    mood,
    title,
    note,
    key
  }: {
    /** Already formatted against the active locale by the caller. */
    time: string;
    /** 1 to 5, or null for an entry logged without one. */
    mood?: number | null;
    title?: string;
    note?: string;
    key?: string;
  } = $props();
</script>

<article class="kit-entry" data-day-entry={key}>
  <span class="kit-entry-time">{time}</span>
  <span class="kit-entry-mark">
    {#if mood}<MoodFace step={mood} size={22} />{:else}<i class="kit-entry-nomood"></i>{/if}
  </span>
  <div class="kit-entry-body">
    {#if title}<b class="kit-entry-title">{title}</b>{/if}
    {#if note}<p class="kit-entry-note">{note}</p>{/if}
  </div>
</article>
