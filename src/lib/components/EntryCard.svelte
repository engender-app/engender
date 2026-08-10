<script lang="ts">
  import Icon from './Icon.svelte';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { tagById } from '$lib/data/repositories/tags';
  import type { Entry } from '$lib/data/types';

  let {
    entry,
    showDay = true,
    dayCount = 1,
  }: { entry: Entry; showDay?: boolean; dayCount?: number } = $props();

  const MOOD_LABELS = ['awful', 'bad', 'meh', 'good', 'great'];
  let tags = $derived(entry.tags.map((id) => tagById(id)).filter((t) => t != null).slice(0, 4));
  let more = $derived(entry.tags.length - tags.length);
</script>

<a class="entry-card" href="/entry/{entry.id}">
  <div class="entry-side">
    {#if entry.mood != null}
      <span
        class="mood-dot"
        style="--dot:26px;background:var(--mood-{entry.mood})"
        role="img"
        aria-label="mood: {MOOD_LABELS[entry.mood - 1]}"
      ></span>
    {:else}
      <span class="mood-dot is-empty" style="--dot:26px" title="no mood"></span>
    {/if}
  </div>
  <div class="entry-main">
    <div class="entry-meta">
      {#if showDay}<span class="entry-day">{fmtDay(entry.epochDay, { weekday: 'short', day: 'numeric', month: 'short' })}</span>{/if}
      <span class="entry-time">{fmtTime(entry.timestamp)}</span>
      {#if dayCount > 1}<span class="entry-multi"><Icon name="dots" size={13} /> {dayCount} that day</span>{/if}
      {#if entry.photos?.length}<span class="entry-has-photo"><Icon name="image" size={13} /></span>{/if}
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
