<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import { calendarDuration } from '$lib/data/epochDay';
  import {
    orderAnchorsByJourney,
    stepCompareAnchor,
    toComparePair,
    toggleCompareAnchor
  } from '$lib/data/photos/compare-state';
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

  let selected = $state<string[]>([]);
  let comparing = $state(false);

  let orderedSelected = $derived(orderAnchorsByJourney(selected, photos));
  let pair = $derived(toComparePair(selected, photos));

  let gapLabel = $derived.by(() => {
    if (!pair) return '';
    const duration = calendarDuration(photos[pair.left].epochDay, photos[pair.right].epochDay);
    return `${fmtDuration(duration)} ${m.apart_suffix()}`;
  });

  function toggle(id: string) {
    selected = toggleCompareAnchor(selected, id, photos);
  }

  function step(which: 'left' | 'right', delta: -1 | 1) {
    selected = stepCompareAnchor(selected, which, delta, photos);
  }
</script>

<div class="screen">
  {#if comparing && pair}
    <header class="screen-header">
      <button class="icon-btn" aria-label={m.back()} onclick={() => (comparing = false)}><Icon name="arrowLeft" /></button>
      <h1 class="screen-title">{m.ph_compare()}</h1>
      <div class="header-action"></div>
    </header>
    <p class="compare-gap">{gapLabel}</p>
    <div class="compare-wrap">
      {#each [{ i: pair.left, which: 'left' as const, canPrev: pair.left > 0, canNext: pair.left < pair.right - 1 }, { i: pair.right, which: 'right' as const, canPrev: pair.right > pair.left + 1, canNext: pair.right < photos.length - 1 }] as side (side.which)}
        <div class="compare-side">
          <PhotoThumb photo={photos[side.i]} size={150} />
          <div class="compare-nav">
            <button class="icon-btn" disabled={!side.canPrev} style={side.canPrev ? '' : 'opacity:.3'}
              aria-label={m.ph_earlier()} onclick={() => step(side.which, -1)}><Icon name="chevronLeft" size={18} /></button>
            <span class="small">{fmtDay(photos[side.i].epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <button class="icon-btn" disabled={!side.canNext} style={side.canNext ? '' : 'opacity:.3'}
              aria-label={m.ph_later()} onclick={() => step(side.which, 1)}><Icon name="chevronRight" size={18} /></button>
          </div>
          <span class="muted small">{photos[side.i].milestoneName ?? m.ph_from_entry()}</span>
        </div>
      {/each}
    </div>
    <div style="margin-top:var(--space-6)">
      <button class="btn btn-soft" onclick={() => { comparing = false; selected = []; }}>
        <span>{m.ph_back_to_all()}</span>
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
      {#if comparing && !pair}
        <p class="muted small" style="margin-bottom:var(--space-2)">{m.ph_compare_reset()}</p>
      {/if}
      <p class="muted small" style="margin-bottom:var(--space-4)">
        {orderedSelected.length === 0
          ? m.ph_pick_two()
          : orderedSelected.length === 1
            ? m.ph_one_selected()
            : m.ph_two_selected()}
      </p>
      <div class="photo-grid">
        {#each photos as p, i (p.id + String(p.epochDay))}
          <button class="photo-cell" class:is-selected={orderedSelected.includes(p.id)} aria-pressed={orderedSelected.includes(p.id)}
            aria-label={m.ph_cell_aria({ date: fmtDay(p.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            onclick={() => toggle(p.id)}>
            <PhotoThumb photo={p} size={104} />
            <span class="photo-date">{fmtDay(p.epochDay, { month: 'short', year: '2-digit' })}</span>
            {#if orderedSelected.includes(p.id)}<span class="photo-check"><Icon name="check" size={14} /></span>{/if}
          </button>
        {/each}
      </div>
      {#if pair}
        <div class="editor-savebar">
          <button class="btn btn-primary" data-compare onclick={() => (comparing = true)}>
            <Icon name="columns" size={20} /><span>{m.ph_compare()}</span>
          </button>
        </div>
      {/if}
    {:else}
      <EmptyState
        title={m.ph_empty_title()}
        text={m.ph_empty_body()}
      />
    {/if}
  {/if}
</div>
