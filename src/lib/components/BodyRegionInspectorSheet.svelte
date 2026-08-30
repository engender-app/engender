<!-- Multi-track anatomical inspector sheet (phase 5 deepening ticket 08).
     Tapping any body region opens this somatic breakdown combining:
     1. Dysphoria/Euphoria trajectory
     2. Linked physical measurements
     3. Filtered progress photos
     4. Laser & hair removal sessions & hair staging records -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { fmtDay } from '$lib/data/dates';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import {
    hairRemovalAreaName,
    hairRemovalMethodName,
    hairScaleName,
    hairStageName
  } from '$lib/data/vocabulary/labels';

  let {
    open = $bindable(false),
    region,
    onClose
  }: {
    open: boolean;
    region: string;
    onClose?: () => void;
  } = $props();

  let regionName = $derived(
    vocabulary.bodyRegions.find((r) => r.id === region)?.name || region
  );

  let breakdownQuery = liveQuery((j) =>
    region ? j.stats.bodyRegionBreakdown(region) : Promise.resolve(undefined)
  );

  let breakdown = $derived(breakdownQuery.value);

  function close() {
    open = false;
    onClose?.();
  }
</script>

<Sheet {open} title={m.body_region_inspector_title({ region: regionName })} onClose={close}>
  <div class="inspector-header">
    <div class="inspector-title-row">
      <h3 class="inspector-title">{m.body_region_inspector_title({ region: regionName })}</h3>
      <button
        type="button"
        class="btn btn-ghost icon-btn"
        onclick={close}
        aria-label={m.done()}
        data-inspector-close
      >
        <Icon name="x" size={20} />
      </button>
    </div>
    <p class="muted small inspector-subtitle">{m.body_region_inspector_sub()}</p>
  </div>

  {#if breakdownQuery.loading}
    <div class="inspector-loading">
      <Skeleton variant="block" count={3} />
    </div>
  {:else if !breakdown || breakdown.isEmpty}
    <EmptyState
      title={m.body_region_empty_title()}
      text={m.body_region_empty_body()}
    />
  {:else}
    <div class="inspector-content stack-4" data-inspector-content>
      <!-- Summary Highlights -->
      {#if breakdown.averageDysphoria !== null || breakdown.averageEuphoria !== null || breakdown.latestDysphoria !== null || breakdown.latestEuphoria !== null}
        <div class="inspector-stats-row" role="group" aria-label={regionName}>
          {#if breakdown.averageDysphoria !== null}
            <div class="inspector-stat-pill">
              <span class="inspector-stat-label">{m.body_region_avg_dysphoria({ value: String(Math.round(breakdown.averageDysphoria)) })}</span>
            </div>
          {/if}
          {#if breakdown.averageEuphoria !== null}
            <div class="inspector-stat-pill">
              <span class="inspector-stat-label">{m.body_region_avg_euphoria({ value: String(Math.round(breakdown.averageEuphoria)) })}</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Track 1: Dysphoria & Euphoria Trajectory -->
      <section class="inspector-section" data-track="trajectory">
        <SectionHeading text={m.body_region_track_trajectory()} />
        {#if breakdown.trajectory.length > 0}
          <ListCard>
            {#each breakdown.trajectory as t, i (`${t.entryId}-${t.epochDay}-${i}`)}
              <ListRow
                icon="heart"
                title={fmtDay(t.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
                subtitle={[
                  t.dysphoria !== null ? `${m.body_region_axis_dysphoria()}: ${t.dysphoria}` : false,
                  t.euphoria !== null ? `${m.body_region_axis_euphoria()}: ${t.euphoria}` : false,
                  t.note || false
                ]}
                static
                chevron={false}
              />
            {/each}
          </ListCard>
        {:else}
          <p class="muted small inspector-empty-track">{m.body_region_trajectory_empty()}</p>
        {/if}
      </section>

      <!-- Track 2: Linked Measurements -->
      <section class="inspector-section" data-track="measurements">
        <SectionHeading text={m.body_region_track_measurements()} />
        {#if breakdown.measurements.length > 0}
          <ListCard>
            {#each breakdown.measurements as mItem (mItem.id)}
              <ListRow
                icon="ruler"
                title={vocabulary.measurementTypeName(mItem.type)}
                subtitle={fmtDay(mItem.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
                static
                chevron={false}
              >
                {#snippet trailing()}
                  <span class="muted small">{mItem.value} {mItem.unit}</span>
                {/snippet}
              </ListRow>
            {/each}
          </ListCard>
        {:else}
          <p class="muted small inspector-empty-track">{m.body_region_measurements_empty()}</p>
        {/if}
      </section>

      <!-- Track 3: Progress Photos -->
      <section class="inspector-section" data-track="photos">
        <SectionHeading text={m.body_region_track_photos()} />
        {#if breakdown.photos.length > 0}
          <div class="inspector-photos-grid">
            {#each breakdown.photos as p (p.id)}
              <div class="inspector-photo-cell">
                <PhotoThumb photo={{ id: p.id, fileName: p.fileName }} size={80} />
                <span class="muted small photo-date">{fmtDay(p.epochDay, { day: 'numeric', month: 'short' })}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="muted small inspector-empty-track">{m.body_region_photos_empty()}</p>
        {/if}
      </section>

      <!-- Track 4: Laser & Hair Removal Sessions and Norwood / Sinclair Hair Staging -->
      <section class="inspector-section" data-track="hair-removal">
        <SectionHeading text={m.body_region_track_hair_removal()} />
        {#if breakdown.hairRemovalSessions.length > 0}
          <ListCard>
            {#each breakdown.hairRemovalSessions as s (s.id)}
              <ListRow
                icon="sparkle"
                title={`${hairRemovalAreaName(s.area)} • ${hairRemovalMethodName(s.method as any)}`}
                subtitle={[
                  fmtDay(s.epochDay, { day: 'numeric', month: 'short', year: 'numeric' }),
                  s.provider || false
                ]}
                static
                chevron={false}
              >
                {#snippet trailing()}
                  <span class="muted small">{m.body_region_session_item({ method: hairRemovalMethodName(s.method as any), pain: String(s.painRating) })}</span>
                {/snippet}
              </ListRow>
            {/each}
          </ListCard>
        {:else}
          <p class="muted small inspector-empty-track">{m.body_region_hair_removal_empty()}</p>
        {/if}
      </section>

      {#if breakdown.hairStages.length > 0}
        <section class="inspector-section" data-track="hair-staging">
          <SectionHeading text={m.body_region_track_hair_staging()} />
          <ListCard>
            {#each breakdown.hairStages as st (st.id)}
              <ListRow
                icon="eye"
                title={`${hairScaleName(st.scale)}: ${hairStageName(st.scale, st.stage)}`}
                subtitle={[
                  fmtDay(st.epochDay, { day: 'numeric', month: 'short', year: 'numeric' }),
                  st.description || false
                ]}
                static
                chevron={false}
              />
            {/each}
          </ListCard>
        </section>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .inspector-header {
    margin-bottom: var(--space-3);
  }

  .inspector-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .inspector-title {
    margin: 0;
    font-size: var(--text-lg);
    line-height: var(--leading-tight);
    text-transform: capitalize;
  }

  .inspector-subtitle {
    margin-top: var(--space-1);
    margin-bottom: 0;
  }

  .inspector-loading {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .inspector-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-top: var(--space-2);
  }

  .inspector-stats-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .inspector-stat-pill {
    padding: var(--space-1) var(--space-2);
    background: var(--bg-surface-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .inspector-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .inspector-empty-track {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--bg-surface-1);
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .inspector-photos-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .inspector-photo-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .photo-date {
    font-size: var(--text-xs);
  }
</style>
