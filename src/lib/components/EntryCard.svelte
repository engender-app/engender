<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { entryContainerName, opensHere, openEntryContainer } from '$lib/motion/container.svelte';
  import Icon from './Icon.svelte';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import type { Entry } from '$lib/data/types';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let {
    entry,
    showDay = true,
    dayCount = 1,
  }: { entry: Entry; showDay?: boolean; dayCount?: number } = $props();

  let tags = $derived(entry.tags.map((id) => vocabulary.tag(id)).filter((t) => t != null).slice(0, 4));
  let more = $derived(entry.tags.length - tags.length);
</script>

<!-- The source half of the container transform, the same as the kit's day
     entry: three screens still draw this card and all three link into the
     editor, so leaving it out would make the transform depend on which
     surface the entry happened to be tapped on
     ($lib/motion/container.svelte).

     The name lives on `.entry-card-bg`, a plain fill with no text of its
     own, rather than on this element - a view transition captures a named
     element as one rasterised image and scales that image between the
     card's rect and the editor's, and this card's own mood dot, time and
     note travelled inside that image too. Scaled up to a full screen from
     a 96px-tall card is roughly a 4-8x zoom, so a line of body text spent
     part of every open blown up to the size a heading would be (Alicja,
     2026-08-27: "the ridiculous huge text transition"). Pulling the name
     onto a background-only layer keeps the shape's grow-into-a-screen
     motion and drops the part that was never meant to zoom: the real
     content now sits outside the named element entirely, so it takes the
     screen's own crossfade (already wired for the container pattern,
     app.css) instead of riding the shape's scale. -->
<a
  class="entry-card"
  data-entry-card
  href="/entry/{entry.id}"
  onclick={(event) => { if (opensHere(event)) openEntryContainer(String(entry.id)); }}
>
  <div class="entry-card-bg" style:view-transition-name={entryContainerName(String(entry.id))}></div>
  <div class="entry-side">
    {#if entry.mood != null}
      <span
        class="mood-dot"
        style="--dot:26px;background:var(--mood-{entry.mood})"
        role="img"
        aria-label={m.entry_mood_aria({ name: moodName(entry.mood) })}
      ></span>
    {:else}
      <span class="mood-dot is-empty" style="--dot:26px" title={m.mood_none()}></span>
    {/if}
  </div>
  <div class="entry-main">
    <div class="entry-meta">
      {#if showDay}<span class="entry-day">{fmtDay(entry.epochDay, { weekday: 'short', day: 'numeric', month: 'short' })}</span>{/if}
      <span class="entry-time">{fmtTime(entry.timestamp)}</span>
      {#if dayCount > 1}<span class="entry-multi"><Icon name="dots" size={13} /> {m.entry_day_count({ count: String(dayCount) })}</span>{/if}
      {#if entry.photos?.length}<span class="entry-has-photo"><Icon name="image" size={13} /></span>{/if}
      {#if entry.recordings?.length}<span class="entry-has-recording"><Icon name="mic" size={13} /></span>{/if}
      {#if entry.videos?.length}<span class="entry-has-video"><Icon name="video" size={13} /></span>{/if}
    </div>
    {#if entry.note}<p class="entry-note" data-entry-note>{entry.note}</p>{/if}
    {#if tags.length}
      <div class="entry-tags">
        {#each tags as t (t.id)}<span class="tag-chip is-mini">{t.label}</span>{/each}
        {#if more > 0}<span class="tag-chip is-mini is-more">+{more}</span>{/if}
      </div>
    {/if}
  </div>
</a>
