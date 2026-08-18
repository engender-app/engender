<script lang="ts">
  import { m } from '$lib/paraglide/messages';
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

<a class="entry-card" href="/entry/{entry.id}">
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
    </div>
    {#if entry.note}<p class="entry-note">{entry.note}</p>{/if}
    {#if tags.length}
      <div class="entry-tags">
        {#each tags as t (t.id)}<span class="tag-chip is-mini">{t.label}</span>{/each}
        {#if more > 0}<span class="tag-chip is-mini is-more">+{more}</span>{/if}
      </div>
    {/if}
  </div>
</a>
