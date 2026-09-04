<script lang="ts">
  /* All photos, then vs now, on the surface kit (phase 5 UX ticket 25).

     The compare view's measurement summary was a `.card` holding a heading
     and a `.list-group` of rows that could not be pressed - two containers
     for one list. It is a heading over a list card now, with the rows as
     `<ListRow static>`, which is what a row that states a reading and goes
     nowhere is.

     The picking grid stays a grid. A photo is chosen by looking at it, so
     the cell is the photograph; nothing about that was the old world's. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import { calendarDuration } from '$lib/data/epochDay';
  import {
    orderAnchorsByJourney,
    stepCompareAnchor,
    toComparePair,
    toggleCompareAnchor
  } from '$lib/data/photos/compare-state';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { Measurement } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /* One query, not a union of a table and a column: entry photos and
     milestone photos are rows in the same table (ADR-0008), already dated and
     ordered oldest first by the journal. Thumbnails only - PhotoThumb never
     decodes a full photo to draw a 104px tile. */
  let photosQuery = liveList((j) => j.photos.inJournal());
  let photos = $derived(photosQuery.rows);

  let selected = $state<string[]>([]);
  let comparing = $state(false);

  let orderedSelected = $derived(orderAnchorsByJourney(selected, photos));
  let pair = $derived(toComparePair(selected, photos));

  let gapLabel = $derived.by(() => {
    if (!pair) return '';
    const duration = calendarDuration(photos[pair.left].epochDay, photos[pair.right].epochDay);
    return `${fmtDuration(duration)} ${m.apart_suffix()}`;
  });

  /* The measurement combined view (ticket 08): the same date range the two
     anchor photos span, so a number and an image answer "what changed"
     side by side. */
  let rangeQuery = liveList((j) =>
    pair ? j.measurements.getMeasurementsInRange(photos[pair.left].epochDay, photos[pair.right].epochDay) : Promise.resolve([])
  );
  let rangeMeasurements = $derived(rangeQuery.rows);

  let rangeSummaries = $derived.by(() => {
    const byType = new Map<string, Measurement[]>();
    for (const measurement of rangeMeasurements) {
      const list = byType.get(measurement.type) ?? [];
      list.push(measurement);
      byType.set(measurement.type, list);
    }
    // Ordered by the vocabulary's own order, hidden types included: a
    // range someone is comparing may still hold a measurement logged
    // against a type since hidden, and this summary reads it back
    // exactly as logged (CONTEXT: "Hidden").
    return vocabulary.measurementTypes
      .filter((t) => byType.has(t.key))
      .map((t) => {
        const list = byType.get(t.key)!;
        return { type: t.key, first: list[0], last: list[list.length - 1] };
      });
  });

  function toggle(id: string) {
    selected = toggleCompareAnchor(selected, id, photos);
  }

  function step(which: 'left' | 'right', delta: -1 | 1) {
    selected = stepCompareAnchor(selected, which, delta, photos);
  }

  /* The mode control (ticket 11): a segmented Browse/Compare, matching how
     the voice screen switches its own tabs, in place of the primary button
     this used to be. "Compare" only ever takes hold once two photos are
     picked - same gate the button enforced by only rendering with a pair -
     so tapping it early is a no-op rather than a jump to a screen with
     nothing to show. */
  function setComparing(next: boolean) {
    if (next) {
      if (pair) comparing = true;
      // Else a no-op: nothing is ready to compare yet, and the segmented
      // control's own value (bound to `comparing`) simply does not move.
    } else {
      comparing = false;
      selected = [];
    }
  }
</script>

<div class="screen">
  {#if comparing && pair}
    <ScreenHeader title={m.ph_compare()} back={() => (comparing = false)} />
    <p class="compare-gap" data-compare-gap>{gapLabel}</p>
    <div class="compare-wrap">
      {#each [{ i: pair.left, which: 'left' as const, canPrev: pair.left > 0, canNext: pair.left < pair.right - 1 }, { i: pair.right, which: 'right' as const, canPrev: pair.right > pair.left + 1, canNext: pair.right < photos.length - 1 }] as side (side.which)}
        <div class="compare-side" data-compare-side={side.which}>
          <PhotoThumb photo={photos[side.i]} size={150} />
          <div class="compare-nav">
            <button class="icon-btn" disabled={!side.canPrev}
              aria-label={m.ph_earlier()} onclick={() => step(side.which, -1)}><Icon name="chevronLeft" size={18} /></button>
            <span class="small" data-compare-date>{fmtDay(photos[side.i].epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <button class="icon-btn" disabled={!side.canNext}
              aria-label={m.ph_later()} onclick={() => step(side.which, 1)}><Icon name="chevronRight" size={18} /></button>
          </div>
          <span class="muted small">{photos[side.i].milestoneName ?? m.ph_from_entry()}</span>
        </div>
      {/each}
    </div>
    {#if rangeSummaries.length}
      <SectionHeading text={m.ph_measurements_title()} />
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each rangeSummaries as s (s.type)}
          <ListRow
            static
            data-range-measurement={s.type}
            title={vocabulary.measurementTypeName(s.type)}
            subtitle={s.first.id === s.last.id
              ? `${s.first.value} ${s.first.unit}`
              : `${s.first.value} ${s.first.unit} → ${s.last.value} ${s.last.unit}`}
          />
        {/each}
      </ListCard>
    {/if}

    <div>
      <button class="btn btn-soft press" onclick={() => setComparing(false)}>
        <span>{m.ph_back_to_all()}</span>
      </button>
    </div>
  {:else}
    <ScreenHeader title={m.progress_photos()} back="/more" />
    <div class="screen-part">
      <Segmented
        name={m.progress_photos()}
        options={[
          { value: 'browse', label: m.ph_tab_browse() },
          { value: 'compare', label: m.ph_tab_compare() }
        ]}
        value={comparing ? 'compare' : 'browse'}
        onChange={(v) => setComparing(v === 'compare')}
        compact
        key="photos-tab"
      />
    </div>
    <ReadGate read={photosQuery} variant="block" count={2}>
      {#snippet rows()}
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
            <button class="photo-cell" data-photo-cell class:is-selected={orderedSelected.includes(p.id)} aria-pressed={orderedSelected.includes(p.id)}
              aria-label={m.ph_cell_aria({ date: fmtDay(p.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
              onclick={() => toggle(p.id)}>
              <PhotoThumb photo={p} size={104} />
              <span class="photo-date">{fmtDay(p.epochDay, { month: 'short', year: '2-digit' })}</span>
              {#if orderedSelected.includes(p.id)}<span class="photo-check"><Icon name="check" size={14} /></span>{/if}
            </button>
          {/each}
        </div>
        <div>
          <a class="btn btn-soft press" href="/settings/photos/export" data-journey-export>
            <Icon name="image" size={20} /><span>{m.pj_open()}</span>
          </a>
        </div>
      {/snippet}
      {#snippet empty()}
        <div class="screen-part">
          <Notice
            icon="image"
            key="photos-empty"
            role={roleAt(activeFlag.roles, 0)}
            title={m.ph_empty_title()}
            text={m.ph_empty_body()}
          />
        </div>
      {/snippet}
    </ReadGate>
  {/if}
</div>
