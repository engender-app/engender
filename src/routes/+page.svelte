<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay, epochDayFromTimestamp } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { entriesNewestFirst, quickLog, streakDays } from '$lib/data/repositories/entries';
  import { upcomingMilestones } from '$lib/data/repositories/milestones';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { toast } from '$lib/stores/toasts.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PrideAurora from '$lib/components/PrideAurora.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import MilestoneCard from '$lib/components/MilestoneCard.svelte';
  import WeekStrip from '$lib/components/WeekStrip.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import RiveSlot from '$lib/components/RiveSlot.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  const today = todayEpochDay();

  let upcoming = $derived(upcomingMilestones());
  let landing = $derived(upcoming.find((x) => x.s.type === 'today' || x.s.isAnnivToday));
  let celebrate = $derived(page.url.searchParams.get('celebrate') === '1' || !!landing);

  let backupAgeDays = $derived(
    prefs.lastBackupAt ? today - epochDayFromTimestamp(prefs.lastBackupAt) : null
  );
  let showBackupNotice = $derived(
    backupAgeDays != null && backupAgeDays > 30 && !prefs.backupNoticeDismissed
  );

  let metricName = $derived(vocabulary.metricName);

  let dayGroups = $derived.by(() => {
    const byDay = new Map<number, ReturnType<typeof entriesNewestFirst>>();
    for (const e of entriesNewestFirst()) {
      if (!byDay.has(e.epochDay)) byDay.set(e.epochDay, []);
      byDay.get(e.epochDay)!.push(e);
    }
    return [...byDay.entries()].sort((a, b) => b[0] - a[0]).slice(0, 5);
  });

  let streak = $derived(streakDays());
  let metricSheetOpen = $state(false);

  function onQuickLog(v: number | null) {
    if (v == null) return;
    const id = quickLog(v);
    toast(m.quick_saved(), { actionLabel: m.add_details(), onAction: () => goto(`/entry/${id}`) });
  }
</script>

<div class="screen">
  <PrideAurora />
  <header class="home-header">
    <h1 class="home-hero" translate="no">{m.app_name()}</h1>
    <p class="home-hello">{prefs.name ? `${m.hello()} ${prefs.name} · ` : ''}{fmtDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    {#if streak > 1}
      <p class="home-streak"><Icon name="sparkle" size={14} /> {streak} {m.streak_row()}</p>
    {/if}
  </header>

  {#if celebrate}
    <div class="celebration card" role="status">
      <RiveSlot label="Celebration: confetti in flag colours" height={90} variant="confetti" src="/rive/celebration.riv" />
      <p class="celebration-text">
        <strong>{landing?.m.name ?? 'HRT start'}</strong>{landing?.s.years
          ? ` — ${landing.s.years} year${landing.s.years === 1 ? '' : 's'} ago today.`
          : ' is today.'} That day mattered. So does this one.
      </p>
    </div>
  {/if}

  {#if showBackupNotice}
    <div class="notice notice-warn" role="status">
      <Icon name="download" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.backup_stale_title({ days: String(backupAgeDays) })}</span>
        {m.backup_stale_body()} <a href="/settings/export">{m.backup_now()}</a>
      </div>
      <button
        class="icon-btn"
        aria-label={m.dismiss()}
        onclick={() => {
          prefs.backupNoticeDismissed = true;
        }}><Icon name="x" size={18} /></button
      >
    </div>
  {/if}

  <div class="card quicklog">
    <p class="quicklog-title">{m.how_feeling()}</p>
    <MoodPicker compact onPick={onQuickLog} />
  </div>

  {#if upcoming.length}
    <SectionTitle text={m.milestones()}>
      {#snippet aside()}<a href="/timeline">{m.timeline()} <Icon name="chevronRight" size={14} /></a>{/snippet}
    </SectionTitle>
    <div class="milestone-scroller">
      {#each upcoming.slice(0, 4) as x (x.m.id)}
        <MilestoneCard m={x.m} s={x.s} />
      {/each}
    </div>
  {/if}

  <SectionTitle text={m.last_seven()}>
    {#snippet aside()}
      <button class="metric-chip" onclick={() => (metricSheetOpen = true)}>
        {m.coloured_by()} <strong>{metricName}</strong> <Icon name="chevronDown" size={14} />
      </button>
    {/snippet}
  </SectionTitle>
  <div class="card"><WeekStrip metric={metricKey(prefs)} /></div>

  <SectionTitle text={m.recent_entries()}>
    {#snippet aside()}<a href="/calendar">{m.nav_calendar()} <Icon name="chevronRight" size={14} /></a>{/snippet}
  </SectionTitle>
  {#if dayGroups.length}
    {#each dayGroups as [day, list] (day)}
      {#each list as e (e.id)}
        <EntryCard entry={e} dayCount={list.length} />
      {/each}
    {/each}
  {:else}
    <EmptyState
      riveLabel="Empty home: a small sprout in flag colours"
      title={m.empty_home_title()}
      text={m.empty_home_body()}
    >
      {#snippet action()}
        <button class="btn btn-primary" onclick={() => (ui.chooserOpen = true)}><span>{m.new_entry()}</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet bind:open={metricSheetOpen} title={m.colour_days_by()}>
    <h3>{m.colour_days_by()}</h3>
    <div class="list-group" style="box-shadow:none">
      {#each [{ key: null, name: m.mood() }, ...vocabulary.activeDimensions] as d (d.key ?? 'mood')}
        <button
          class="list-row"
          onclick={() => {
            selectMetric(d.key);
            metricSheetOpen = false;
          }}
        >
          <span class="row-text"><span class="row-title">{d.name}</span></span>
          {#if prefs.metricDimension === d.key}<Icon name="check" size={20} />{/if}
        </button>
      {/each}
    </div>
    <p class="muted small" style="margin-top:var(--space-3)">{m.metric_note()}</p>
  </Sheet>
</div>
