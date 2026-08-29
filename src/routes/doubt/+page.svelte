<script lang="ts">
  /* Safe Space (ticket 52, ADR-0040, CONTEXT: "Safe space").
     The crisis-mode dashboard for intense dysphoria:
     - Calming tool: guided box breathing exercise with concentric ambient halo
     - Grounding statistics: streak and good moments from the journal
     - Visual charts: 30-day timeline and affirming themes breakdown
     - Counterevidence pool: euphoria-tagged, high-euphoria body region, and starred entries
     - Snapshots: frozen captures of past counterevidence pools

     Purely a read: opening the screen writes nothing (ADR-0037). */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { EUPHORIA_TAG_KEYS } from '$lib/data/vocabulary/builtins';
  import type { CounterevidenceEntry, CounterevidenceSnapshot } from '$lib/data/types';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import Tile from '$lib/components/kit/Tile.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import BarRows from '$lib/components/kit/BarRows.svelte';
  import type { BarRow } from '$lib/components/kit/barRow';
  import { atGrain } from '$lib/charts/grain';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import BreathingExercise from '$lib/components/BreathingExercise.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';

  const COUNTEREVIDENCE_LIMIT = 20;
  const HISTORY_LIMIT = 50;
  const TIMELINE_DAYS = 30;

  let today = $derived(todayEpochDay());
  let from = $derived(today - TIMELINE_DAYS + 1);

  let counterevidenceQuery = liveList((j) =>
    j.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT)
  );
  let counterevidence = $derived(counterevidenceQuery.rows);

  let streakQuery = liveQuery((j) => j.stats.streak(today));
  let streakDays = $derived(streakQuery.value ?? 0);

  let dayAveragesQuery = liveList((j) => j.stats.dayAverages('mood', from, today));
  let rawPoints = $derived(dayAveragesQuery.rows.map((r) => ({ x: r.day, y: r.value })));
  let plotted = $derived(atGrain(rawPoints, TIMELINE_DAYS));

  let affirmingTagRows = $derived.by<BarRow[]>(() => {
    const counts = new Map<string, number>();
    for (const entry of counterevidence) {
      if (entry.tags) {
        for (const t of entry.tags) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return sorted.map(([tagId, count]) => ({
      key: tagId,
      name: vocabulary.tag(tagId)?.label ?? tagId,
      value: `${count}×`,
      amount: count
    }));
  });

  let snapshotsQuery = liveList((j) => j.doubtJournal.getSnapshots(HISTORY_LIMIT));
  let snapshots = $derived(snapshotsQuery.rows);

  async function saveSnapshot() {
    if (counterevidence.length === 0) return;
    const items: CounterevidenceEntry[] = counterevidence.map((e) => ({
      epochDay: e.epochDay,
      mood: e.mood,
      note: e.note
    }));
    await journal.doubtJournal.saveSnapshot(today, items);
  }

  let snapshotDeleteTarget = $state<CounterevidenceSnapshot | null>(null);
  async function deleteSnapshot() {
    if (!snapshotDeleteTarget) return;
    const id = snapshotDeleteTarget.id;
    snapshotDeleteTarget = null;
    await journal.doubtJournal.deleteSnapshot(id);
  }

  const dayLabel = (epochDay: number) =>
    fmtDay(epochDay, { weekday: 'short', day: 'numeric', month: 'short' });

  $effect(() => {
    // Opening Safe Space resolves any pending Safe Space nudge instance (ticket 50).
    journal.entries.latestBadMomentEntry().then((entry) => {
      if (
        entry &&
        (prefs.safeSpaceNudgeDismissedEntryId == null || entry.id > prefs.safeSpaceNudgeDismissedEntryId)
      ) {
        prefs.safeSpaceNudgeDismissedEntryId = entry.id;
      }
    });
  });
</script>

<div class="screen">
  <ScreenHeader title={m.safe_space_title()} back={() => smartBack('/more')} />

  <SectionHeading text={m.safe_space_calm_title()} />
  <BreathingExercise role={roleAt(activeFlag.roles, 0)} />

  <SectionHeading text={m.safe_space_stats_title()} />
  <TileGrid
    role={roleAt(activeFlag.roles, 1)}
    flagFill={activeFlag.fill === 'none' ? undefined : activeFlag.fill}
    data-safe-space-stats
  >
    <Tile
      key="streak"
      title={m.safe_space_stat_streak_title()}
      value={String(streakDays)}
      note={m.safe_space_stat_streak_note()}
      href="/calendar"
    />
    <Tile
      key="evidence"
      title={m.safe_space_stat_evidence_title()}
      value={String(counterevidence.length)}
      note={m.safe_space_stat_evidence_note()}
      href="/search/starred"
    />
  </TileGrid>

  <!-- 30-Day Continuity Timeline -->
  <ChartCard
    heading={m.safe_space_chart_timeline_title()}
    kind="timeline"
    role={roleAt(activeFlag.roles, 1)}
  >
    {#if plotted.points.length > 1}
      <AreaChart
        points={plotted.points}
        min={1}
        max={5}
        ariaLabel={m.safe_space_chart_timeline_title()}
        from={fmtDay(from, { day: 'numeric', month: 'short' })}
        to={fmtDay(today, { day: 'numeric', month: 'short' })}
      />
    {:else}
      <ChartEmpty>{m.safe_space_no_themes()}</ChartEmpty>
    {/if}
  </ChartCard>

  <!-- Affirming Themes Breakdown -->
  {#if affirmingTagRows.length > 0}
    <ChartCard
      heading={m.safe_space_chart_themes_title()}
      kind="affirming-themes"
      role={roleAt(activeFlag.roles, 2)}
    >
      <BarRows rows={affirmingTagRows} />
    </ChartCard>
  {/if}

  <SectionHeading text={m.safe_space_counterevidence_title()} />
  <p class="muted small" style="margin-bottom:var(--space-3)">{m.safe_space_counterevidence_sub()}</p>
  <ReadGate read={counterevidenceQuery} variant="card" count={2}>
    {#snippet rows()}
      {#each counterevidence as e (e.id)}
        <EntryCard entry={e} />
      {/each}
      <button type="button" class="btn btn-soft btn-block press" onclick={saveSnapshot}>
        <Icon name="heart" size={18} /> <span>{m.doubt_save_snapshot()}</span>
      </button>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="sparkle"
        key="no-counterevidence"
        title={m.doubt_no_counterevidence_title()}
        text={m.doubt_no_counterevidence_body()}
      />
    {/snippet}
  </ReadGate>

  {#if snapshots.length}
    <SectionHeading text={m.doubt_snapshots_title()} />
    <div class="stack-3">
      {#each snapshots as snap (snap.id)}
        <div class="card" data-kit-surface {...roleAttrs(roleAt(activeFlag.roles, 3))}>
          <div class="spread">
            <span class="kit-row-title">{dayLabel(snap.epochDay)} · {fmtTime(snap.timestamp)}</span>
            <button
              type="button"
              class="icon-btn"
              aria-label={m.doubt_snapshot_delete_sheet()}
              onclick={() => (snapshotDeleteTarget = snap)}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
          {#each snap.items as item, i (i)}
            <p class="kit-entry-note">
              {#if item.mood != null}<strong>{moodName(item.mood)}</strong> · {/if}{dayLabel(item.epochDay)}: {item.note}
            </p>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <ConfirmDeleteSheet
    open={snapshotDeleteTarget !== null}
    title={m.doubt_snapshot_delete_sheet()}
    question={m.doubt_snapshot_delete_q()}
    hint={m.doubt_snapshot_delete_hint()}
    confirmLabel={m.doubt_snapshot_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-doubt-snapshot': '' }}
    onConfirm={deleteSnapshot}
    onCancel={() => (snapshotDeleteTarget = null)}
  />
</div>
