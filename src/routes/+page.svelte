<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { backupAgeDays, backupIsStale } from '$lib/data/backupHealth';
  import { fmtDay } from '$lib/data/dates';
  import type { Entry, TallyKind } from '$lib/data/types';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { upcomingMilestones } from '$lib/data/milestoneStatus';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
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
  import Skeleton from '$lib/components/Skeleton.svelte';
  import WrappedHomeCard from '$lib/components/WrappedHomeCard.svelte';
  import OnThisDayHomeCard from '$lib/components/OnThisDayHomeCard.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  const today = todayEpochDay();

  /* Milestones are mirrored (ADR-0004), so this stays a synchronous derived
     read; the entry-shaped reads below are the ones that had to become
     queries. */
  let upcoming = $derived(upcomingMilestones(vocabulary.milestones, today));
  let landing = $derived(upcoming.find((x) => x.s.type === 'today' || x.s.isAnnivToday));
  let celebrate = $derived(page.url.searchParams.get('celebrate') === '1' || !!landing);

  let backupAge = $derived(backupAgeDays(prefs.lastBackupAt, today));
  let showBackupNotice = $derived(backupIsStale(prefs.lastBackupAt, today) && !prefs.backupNoticeDismissed);

  let metricName = $derived(vocabulary.metricName);

  /* Five days, not five entries: the section heads each day with how many
     entries it holds, and a row limit would cut a two-entry day in half. */
  const RECENT_DAYS = 5;
  let recent = liveQuery(['entry'], (j) => j.entries.recentDays(RECENT_DAYS));
  let dayGroups = $derived.by(() => {
    const byDay = new Map<number, Entry[]>();
    for (const e of recent.value ?? []) {
      if (!byDay.has(e.epochDay)) byDay.set(e.epochDay, []);
      byDay.get(e.epochDay)!.push(e);
    }
    return [...byDay.entries()];
  });

  let streakQuery = liveQuery(['entry'], (j) => j.stats.streak(today));
  let streak = $derived(streakQuery.value ?? 0);
  let metricSheetOpen = $state(false);

  function onQuickLog(v: number | null) {
    if (v == null) return;
    goto(`/entry/new/today?seedMood=${v}`);
  }

  /* The tap itself logs the counter, with no context, so it never waits on
     anything after it: the sheet that follows is an optional way to attach
     context to that same event, and dismissing it (Escape, tapping the
     scrim) leaves the tap logged rather than discarding it (CONTEXT: "Tally
     event"). */
  let tallyKind = $state<TallyKind | null>(null);
  let tallyEventId = $state<string | null>(null);
  let tallyContext = $state('');
  const tallyLabel = (kind: TallyKind) => (kind === 'misgendered' ? m.tally_misgendered() : m.tally_correctly_gendered());

  async function tapTally(kind: TallyKind) {
    tallyContext = '';
    tallyKind = kind;
    tallyEventId = await journal.tally.log({ epochDay: today, kind });
  }

  async function saveTallyContext() {
    if (!tallyEventId) return;
    const context = tallyContext.trim();
    if (context) await journal.tally.setContext(tallyEventId, context);
    tallyKind = null;
    tallyEventId = null;
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
      <RiveSlot height={90} variant="confetti" />
      <p class="celebration-text">
        {landing?.s.years
          ? m.home_anniv_years({
              name: landing.m.name,
              years: m.n_years({ n: landing.s.years ?? 0 })
            })
          : m.home_anniv_today({ name: landing?.m.name ?? m.ms_default_name() })}
      </p>
    </div>
  {/if}

  {#if showBackupNotice}
    <div class="notice notice-warn" role="status">
      <Icon name="download" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.backup_stale_title({ days: String(backupAge) })}</span>
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

  <!-- Gated on the preference here rather than inside the card, so that
       turning wrapped off unmounts it and the recap read behind it never
       runs (phase 4 features ticket 01). The card decides for itself whether
       the offered period clears the entry floor. -->
  {#if prefs.wrappedEnabled}
    <WrappedHomeCard />
  {/if}

  <!-- Same gating, and its own preference (ticket 03): turning wrapped off
       must not turn this off, and vice versa. -->
  {#if prefs.onThisDayEnabled}
    <OnThisDayHomeCard />
  {/if}

  <div class="card">
    <p class="quicklog-title">{m.tally_card_title()}</p>
    <div class="tally-buttons">
      <button class="btn btn-soft" onclick={() => tapTally('misgendered')}>
        <Icon name="x" size={18} /> <span>{m.tally_misgendered()}</span>
      </button>
      <button class="btn btn-soft" onclick={() => tapTally('correctly_gendered')}>
        <Icon name="check" size={18} /> <span>{m.tally_correctly_gendered()}</span>
      </button>
    </div>
  </div>

  <!-- A persistent, always-visible Home affordance opening the doubt-entry
       flow in one tap, without the normal new-entry chooser first (phase 4
       ticket 11, Q13: Home-level, never lock-screen or disguise-mode). -->
  <a class="card" style="display:block;color:inherit;text-decoration:none" href="/doubt">
    <p class="quicklog-title">{m.doubt_home_card_title()}</p>
    <p class="row-subtitle" style="margin:2px 0 var(--space-3)">{m.doubt_home_card_body()}</p>
    <span class="btn btn-soft btn-block"><Icon name="heart" size={18} /> <span>{m.doubt_home_card_button()}</span></span>
  </a>

  <!-- NAV-003: this section used to disappear entirely with no milestones,
       which also meant Timeline - only linked from here - was structurally
       unreachable exactly when its own empty state most needed to be seen. -->
  <SectionTitle text={m.milestones()}>
    {#snippet aside()}<a href="/timeline">{m.timeline()} <Icon name="chevronRight" size={14} /></a>{/snippet}
  </SectionTitle>
  {#if upcoming.length}
    <div class="milestone-scroller">
      {#each upcoming.slice(0, 4) as x (x.m.id)}
        <MilestoneCard milestone={x.m} s={x.s} />
      {/each}
    </div>
  {:else}
    <a class="card" style="display:block;color:inherit;text-decoration:none" href="/settings/milestones">
      <span class="row-title">{m.home_milestones_empty_title()}</span>
      <p class="row-subtitle" style="margin-top:2px">{m.home_milestones_empty_body()}</p>
    </a>
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
  {#if recent.loading}
    <Skeleton variant="card" count={3} />
  {:else if dayGroups.length}
    {#each dayGroups as [day, list] (day)}
      {#each list as e (e.id)}
        <EntryCard entry={e} dayCount={list.length} />
      {/each}
    {/each}
  {:else}
    <EmptyState
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

  <Sheet
    open={tallyKind !== null}
    title={tallyKind ? tallyLabel(tallyKind) : ''}
    onClose={() => {
      tallyKind = null;
      tallyEventId = null;
    }}
  >
    {#if tallyKind}
      <h3>{tallyLabel(tallyKind)}</h3>
      <textarea
        class="input"
        rows="3"
        placeholder={m.tally_context_placeholder()}
        bind:value={tallyContext}
      ></textarea>
      <button class="btn btn-primary btn-block" style="margin-top:var(--space-3)" onclick={saveTallyContext}>
        <span>{m.tally_add_context_button()}</span>
      </button>
    {/if}
  </Sheet>
</div>
