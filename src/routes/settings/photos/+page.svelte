<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import { calendarDuration } from '$lib/data/epochDay';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  /* One query, not a union of a table and a column: entry photos and
     milestone photos are rows in the same table (ADR-0008), already dated and
     ordered oldest first by the journal. Thumbnails only - PhotoThumb never
     decodes a full photo to draw a 104px tile. */
  let photosQuery = liveQuery(['photo', 'entry', 'milestone'], (j) => j.photos.inJournal());
  let photos = $derived(photosQuery.value ?? []);

  let selected = $state<number[]>([]);
  let comparing = $state(false);

  let pair = $derived.by(() => {
    if (selected.length !== 2) return null;
    const [ia, ib] = [...selected].sort((a, b) => photos[a].epochDay - photos[b].epochDay);
    return { ia, ib };
  });

  let gapLabel = $derived.by(() => {
    if (!pair) return '';
    const duration = calendarDuration(photos[pair.ia].epochDay, photos[pair.ib].epochDay);
    return `${fmtDuration(duration)} ${m.apart_suffix()}`;
  });

  function toggle(i: number) {
    selected = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i].slice(-2);
  }

  function step(which: 'a' | 'b', delta: number) {
    if (!pair) return;
    selected = which === 'a' ? [pair.ia + delta, pair.ib] : [pair.ia, pair.ib + delta];
  }
</script>

<div class="screen">
  {#if comparing && pair}
    <header class="screen-header">
      <button class="icon-btn" aria-label={m.back()} onclick={() => (comparing = false)}><Icon name="arrowLeft" /></button>
      <h1 class="screen-title">Compare</h1>
      <div class="header-action"></div>
    </header>
    <p class="compare-gap">{gapLabel}</p>
    <div class="compare-wrap">
      {#each [{ i: pair.ia, which: 'a' as const, canPrev: pair.ia > 0, canNext: pair.ia < pair.ib - 1 }, { i: pair.ib, which: 'b' as const, canPrev: pair.ib > pair.ia + 1, canNext: pair.ib < photos.length - 1 }] as side (side.which)}
        <div class="compare-side">
          <PhotoThumb photo={photos[side.i]} size={150} />
          <div class="compare-nav">
            <button class="icon-btn" disabled={!side.canPrev} style={side.canPrev ? '' : 'opacity:.3'}
              aria-label="Earlier photo" onclick={() => step(side.which, -1)}><Icon name="chevronLeft" size={18} /></button>
            <span class="small">{fmtDay(photos[side.i].epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <button class="icon-btn" disabled={!side.canNext} style={side.canNext ? '' : 'opacity:.3'}
              aria-label="Later photo" onclick={() => step(side.which, 1)}><Icon name="chevronRight" size={18} /></button>
          </div>
          <span class="muted small">{photos[side.i].milestoneName ?? 'journal entry'}</span>
        </div>
      {/each}
    </div>
    <div style="margin-top:var(--space-6)">
      <button class="btn btn-soft" onclick={() => { comparing = false; selected = []; }}>
        <span>Back to all photos</span>
      </button>
    </div>
  {:else}
    <header class="screen-header">
      <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
      <h1 class="screen-title">{m.progress_photos()}</h1>
      <div class="header-action"></div>
    </header>
    {#if photosQuery.loading}
      <Skeleton variant="card" count={2} />
    {:else if photos.length}
      <p class="muted small" style="margin-bottom:var(--space-4)">
        {selected.length === 0
          ? 'Every photo in your journal, oldest first. Select two to compare.'
          : selected.length === 1
            ? 'One selected — pick a second to compare.'
            : 'Two selected.'}
      </p>
      <div class="photo-grid">
        {#each photos as p, i (p.id + String(p.epochDay))}
          <button class="photo-cell" class:is-selected={selected.includes(i)} aria-pressed={selected.includes(i)}
            aria-label="Photo from {fmtDay(p.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}"
            onclick={() => toggle(i)}>
            <PhotoThumb photo={p} size={104} />
            <span class="photo-date">{fmtDay(p.epochDay, { month: 'short', year: '2-digit' })}</span>
            {#if selected.includes(i)}<span class="photo-check"><Icon name="check" size={14} /></span>{/if}
          </button>
        {/each}
      </div>
      {#if selected.length === 2}
        <div class="editor-savebar">
          <button class="btn btn-primary" data-compare onclick={() => (comparing = true)}>
            <Icon name="columns" size={20} /><span>Compare</span>
          </button>
        </div>
      {/if}
    {:else}
      <EmptyState
        riveLabel="Empty photos: a polaroid frame waiting"
        title="No photos yet"
        text="Photos you attach to entries and milestones gather here — and one day, “then vs now” will be worth it."
      />
    {/if}
  {/if}
</div>
