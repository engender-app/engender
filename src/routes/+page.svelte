<script lang="ts">
  /* Home, rebuilt from the surface kit (phase 5 ticket 21), which is also
     what closes spec 08 - "Home carries fewer cards".

     What it used to be: twelve card surfaces able to render at once, all of
     them the same rounded box, followed by an uncapped list of entries. The
     shape now is five named areas, each on the surface its content actually
     wants (DIRECTION.md 2b) - the chip row for mood, two tiles for the look
     back, a list card for milestones, the bare strip for the week, day cards
     for entries - and two notices that only ever appear when there is
     something to say.

     What left. The tally buttons, which quick add carries since ticket 18.
     The doubt-journal card, which was an unconditional daily prompt about
     doubt and is now a row of the More hub, one tap from the tab bar and
     silent until asked. The wrapped and on-this-day teasers, which are the
     two look-back tiles; each keeps its own preference gate, so silencing
     one leaves the other alone. And the streak, which was a pill of its own
     under the greeting and is now the caption on the week it describes -
     a big number with a small label and an accent is a template the craft
     floor names, and folding it into the strip removed a surface as well as
     the tell.

     Colour comes from the flag, categorically (DIRECTION.md): each area
     takes one stripe as its own. The two conditional notices take a fixed
     role rather than a positional one, because a notice that appears on a
     Tuesday must not change what colour the milestones are.

     The week strip takes role 0 rather than its place in reading order, and
     that is the one deliberate break. $lib/theme/roles.ts orders a flag's
     colours before its shades, so role 0 is the only index guaranteed to be
     a colour on all 8 palettes - and the strip is the one area here where
     the stripe is a value rather than a decoration. On trans, whose flag
     yields three roles for four areas, reading order would have handed the
     strip the white band, and a heat ramp from white into a white page is
     not a ramp. Everything else takes its turn as normal.

     Out of scope, and named because it is the obvious next question: live
     reads and writes are wired already, but the integration effort ticket
     15 excluded is not this ticket's - what is new here is the shape. */
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { backupAgeDays, backupIsStale } from '$lib/data/backupHealth';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import type { TallyKind } from '$lib/data/types';
  import { isPausedOn } from '$lib/data/journalingPause';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { upcomingMilestones } from '$lib/data/milestoneStatus';
  import { RECENT_ENTRY_CAP, entryMarks, recentDayGroups } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import { fadeOnly, motionDuration } from '$lib/motion/tokens';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { ui } from '$lib/stores/ui.svelte';
  import FlagSun from '$lib/components/FlagSun.svelte';
  import MilestoneCard from '$lib/components/MilestoneCard.svelte';
  import WeekStrip from '$lib/components/WeekStrip.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import WrappedHomeCard from '$lib/components/WrappedHomeCard.svelte';
  import OnThisDayHomeCard from '$lib/components/OnThisDayHomeCard.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import DayCard from '$lib/components/kit/DayCard.svelte';
  import DayEntry from '$lib/components/kit/DayEntry.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import MoodChips from '$lib/components/kit/MoodChips.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  const today = todayEpochDay();

  /* Which stripe each area of the screen takes. Named rather than written as
     a number at the call site, because one of them is not in reading order
     and the reason lives up in the header comment: the week strip takes role
     0, the only index guaranteed to be a colour on all 8 palettes, since it
     is the one area here where the stripe is a value rather than a
     decoration. The celebration shares the milestones' colour because it is
     about a milestone; the backup notice takes none, because the flag
     colours the areas of the journal and that one is the app talking about
     itself. */
  const AREA_ROLE = { week: 0, lookBack: 1, milestones: 2, days: 3 };

  /* Milestones are mirrored (ADR-0004), so this stays a synchronous derived
     read; the entry-shaped reads below are the ones that had to become
     queries. */
  let upcoming = $derived(upcomingMilestones(vocabulary.milestones, today));
  let landing = $derived(upcoming.find((x) => x.s.type === 'today' || x.s.isAnnivToday));
  let celebrate = $derived(page.url.searchParams.get('celebrate') === '1' || !!landing);

  let backupAge = $derived(backupAgeDays(prefs.lastBackupAt, today));
  let showBackupNotice = $derived(backupIsStale(prefs.lastBackupAt, today) && !prefs.backupNoticeDismissed);

  /* Five days, not five entries, is what the read asks for: the day cards
     head each day with how many entries it holds, and a query row limit
     would leave that number unanswerable. The cap is applied to what is
     drawn (recentEntries.ts), and the rest are one tap away on the
     calendar. */
  const RECENT_DAYS = 5;
  let recent = liveQuery((j) => j.entries.recentDays(RECENT_DAYS));
  let dayGroups = $derived(recentDayGroups(recent.value ?? [], RECENT_ENTRY_CAP));

  let streakQuery = liveQuery((j) => j.stats.streak(today));
  let streak = $derived(streakQuery.value ?? 0);

  /* The journaling pause (phase 5 features ticket 21): the streak caption is
     a nudge, the same as the check-in prompt, so it goes quiet while a pause
     covers today rather than showing a frozen number with nothing to
     explain it. */
  let pausesQuery = liveQuery((j) => j.journalingPauses.getPauses());
  let pausedToday = $derived(isPausedOn(pausesQuery.value ?? [], today));

  /* A second authored moment, and the only one besides the sun: past a
     week's run, opening Home throws a little confetti over the streak line.
     It plays once on arriving and stops - it is not a loop, which is the
     line DIRECTION.md's tier 4 actually draws, and it is why the old
     celebration card's infinite `cf-fall` had to go rather than move here.

     Gated on the streak having run past a week so it stays an event. At
     `streak > 1`, which is what puts the line on screen at all, it would
     fire most mornings and stop meaning anything.

     The pieces are a fixed table rather than a random scatter: a moment
     that is different every time cannot be reviewed, and a screenshot of it
     is not evidence of anything. Nine, because that is what fits across the
     line's width without reading as a shower. */
  const STREAK_CHEER_FLOOR = 7;
  let cheering = $derived(streak > STREAK_CHEER_FLOOR && !pausedToday);
  /* `dx` is how far the piece drifts sideways, and it only means anything to
     the streak's burst: the nine fan outward from the middle of the line as
     they go up, which is what makes it read as thrown rather than dropped.
     The milestone's fall ignores it. */
  const CHEER = [
    { i: 0, x: 4, d: 0, r: 200, dx: -13 },
    { i: 1, x: 17, d: 0.16, r: -260, dx: -9 },
    { i: 2, x: 29, d: 0.07, r: 300, dx: -6 },
    { i: 3, x: 41, d: 0.26, r: -180, dx: -2 },
    { i: 4, x: 52, d: 0.03, r: 240, dx: 0 },
    { i: 5, x: 64, d: 0.2, r: -300, dx: 2 },
    { i: 6, x: 76, d: 0.11, r: 260, dx: 6 },
    { i: 7, x: 87, d: 0.3, r: -220, dx: 9 },
    { i: 8, x: 95, d: 0.05, r: 180, dx: 13 }
  ];

  /* Which reading shades the week. The kit's own picker rather than a sheet
     of its own: it is the heading's one control and it sits on the heading's
     line, which is where DIRECTION.md puts a section's switch. The choice is
     shared with the calendar's heat map, which keeps a sheet of its own
     until ticket 22 reaches it. */
  let metricOptions = $derived([
    { value: 'mood', label: m.mood() },
    ...vocabulary.activeDimensions.map((d) => ({ value: d.key, label: d.name }))
  ]);

  function onQuickLog(v: number | null) {
    if (v == null) return;
    goto(`/entry/new/today?seedMood=${v}`);
  }

  /* Tier 3, change within a screen: the skeleton crossfades into the day
     cards rather than being cut away under them. Reduced motion takes the
     duration to zero, which is tier 3's substitute - an instant cut, not
     tier 2's crossfade, because a change inside a screen has no journey for
     a fade to stand in for. */
  const crossfade = (_node: Element) => fadeOnly(motionDuration('--dur-fast'));

  /* The tally widget's two buttons (phase 4 ticket 33) deep-link here with
     the kind as a query param, since neither button opens a route of its
     own, and `/` is the route the launcher is allowed to open
     (android/launch-routes.ts). Home no longer draws the two directions -
     quick add does - but it is still where the widget lands, so the write
     stays. No follow-up sheet and no confirmation: a widget tap gets no
     further screen. The param is cleared the same way quickLogDims is
     below, so reloading or going back never re-logs it. */
  $effect(() => {
    const raw = page.url.searchParams.get('tally');
    if (!raw) return;
    const kind: TallyKind | null = raw === 'misgendered' || raw === 'correctly_gendered' ? raw : null;
    if (kind) journal.tally.log({ epochDay: today, kind });
    goto('/', { replaceState: true, noScroll: true, keepFocus: true });
  });

  /* Phase 4 ticket 13: a quick log's save already happened before this
     sheet ever opens (EntryEditor.svelte), so declining it never delays or
     blocks the quick log itself - it only decides whether the scale values
     on the same entry get filled in too. `quickLogDims` arrives as a query
     param because the save navigates here; the effect below reads it once
     and replaces the URL so reloading or going back never reopens the
     sheet. */
  let dimsPromptEntryId = $state<number | null>(null);
  // A `type="number"` input binds its value as a number, not a string.
  let dimInputs = $state<Record<string, number | undefined>>({});

  $effect(() => {
    const raw = page.url.searchParams.get('quickLogDims');
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isNaN(id)) {
      dimInputs = {};
      dimsPromptEntryId = id;
    }
    goto('/', { replaceState: true, noScroll: true, keepFocus: true });
  });

  async function saveQuickLogDims() {
    if (dimsPromptEntryId == null) return;
    const dims: Record<string, number> = {};
    for (const dim of vocabulary.activeDimensions) {
      const n = dimInputs[dim.key];
      if (n == null || Number.isNaN(n)) continue;
      dims[dim.key] = Math.min(dim.max, Math.max(dim.min, Math.round(n)));
    }
    if (Object.keys(dims).length) await journal.entries.upsertEntry({ id: dimsPromptEntryId, dims });
    dimsPromptEntryId = null;
  }
</script>

<!-- The nine pieces, once, because the streak's moment and a milestone's are
     the same moment about two different facts, and two copies of the table is
     how they would stop being. -->
{#snippet cheer(burst = false)}
  <span class="home-cheer" class:is-burst={burst} aria-hidden="true">
    {#each CHEER as piece (piece.i)}
      <i
        style={`--x: ${piece.x}%; --d: ${piece.d}s; --r: ${piece.r}deg; --dx: ${piece.dx}px`}
      ></i>
    {/each}
  </span>
{/snippet}

<div class="screen home">
  <header class="home-header" data-home-header>
    <!-- Home-only, and never under disguise (ADR-0035) - checked on
         prefs.disguise here rather than inside FlagSun, so the one place
         that decides whether the sun renders at all matches every other
         disguise gate in the app. -->
    {#if !prefs.disguise}<FlagSun />{/if}
    <!-- The same swap AppNav.svelte makes on the rail's wordmark, and for
         the reason SCREENS.md gives: disguise changes the app's name and
         icon app-wide, not per screen. The hero is the largest text on the
         screen, so leaving it saying "Gender Diary" while the tab, the
         launcher and the rail all say "Notes" undoes the rest of the
         disguise in one line. Two sites in Settings still name the app under
         disguise; those are ticket 24's screen. -->
    <h1 class="home-hero" data-home-hero translate="no">{prefs.disguise ? 'Notes' : m.app_name()}</h1>
    <p class="home-hello" data-home-hello>{prefs.name ? `${m.hello()} ${prefs.name} · ` : ''}{fmtDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <!-- Under the greeting rather than under the week strip. Still not the
         hero-metric template the craft floor names - no pill, no accent, no
         display size - which is what "the streak is not a hero metric" is
         about; where the line sits is a composition decision and this is
         where it was asked for. -->
    {#if streak > 1 && !pausedToday}
      <div class="home-streak-wrap">
        {#if cheering}{@render cheer(true)}{/if}
        <p class="home-streak" data-home-streak="line">{streak} {m.streak_row()}</p>
      </div>
    {/if}
  </header>

  <!-- The anniversary, as one line rather than a card with a confetti loop
       falling through it. The words are the ones it always said; what went
       is the loop, because the flag sun is the whole of the app's ambient
       motion budget and a second one on the same screen spends it twice
       (DIRECTION.md, tiers 0 and 4). It takes the milestones' own colour,
       since that is what it is about. -->
  {#if celebrate}
    <!-- The same nine pieces the streak throws, over the notice that says
         which milestone it is (Alicja, 2026-08-25: "we want the same confetti
         animation when it's a milestone day"). It is the streak's own
         argument applied to a rarer fact - a moment that plays once and stops
         costs nothing after it stops - and this one fires on the day a
         milestone lands rather than on most mornings. -->
    <div class="home-celebrate">
      {@render cheer()}
      <Notice
        icon="sparkle"
        key="celebration"
        role={roleAt(activeFlag.roles, AREA_ROLE.milestones)}
        aria-live="polite"
        title={landing?.s.years
          ? m.home_anniv_years({
              name: landing.m.name,
              years: m.n_years({ n: landing.s.years ?? 0 })
            })
          : m.home_anniv_today({ name: landing?.m.name ?? m.ms_default_name() })}
      />
    </div>
  {/if}

  <!-- No coloured side border, and no role: the flag colours the areas of
       the journal, and this is the app talking about itself. -->
  {#if showBackupNotice}
    <Notice
      icon="download"
      key="backup"
      title={m.backup_stale_title({ days: String(backupAge) })}
      text={m.backup_stale_body()}
      action={{ label: m.backup_now(), href: '/settings/export' }}
      dismiss={{ label: m.dismiss(), onclick: () => (prefs.backupNoticeDismissed = true) }}
      aria-live="polite"
      data-backup-notice=""
    />
  {/if}

  <SectionHeading text={m.how_feeling()} />
  <MoodChips onPick={onQuickLog} />

  <!-- The two look-back tiles. The grid is unconditional and each tile
       gates itself on its own preference and its own floor, which is what
       keeps the two halves independent: turning wrapped off unmounts its
       tile and the recap read behind it, and leaves this one's sibling
       exactly where it was. With neither qualifying the grid has no
       children and so no height, and the air around it belongs to its
       neighbours rather than to itself. -->
  <TileGrid
    role={roleAt(activeFlag.roles, AREA_ROLE.lookBack)}
    flagFill={activeFlag.fill === 'none' ? undefined : activeFlag.fill}
  >
    {#if prefs.wrappedEnabled}
      <WrappedHomeCard />
    {/if}
    {#if prefs.onThisDayEnabled}
      <OnThisDayHomeCard />
    {/if}
  </TileGrid>

  <!-- NAV-003: this section used to disappear entirely with no milestones,
       which also meant Timeline - only linked from here - was structurally
       unreachable exactly when its own empty state most needed to be seen. -->
  <SectionHeading text={m.milestones()}>
    {#snippet action()}
      <a class="kit-heading-action" href="/timeline">{m.timeline()}</a>
    {/snippet}
  </SectionHeading>
  <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.milestones)}>
    {#if upcoming.length}
      {#each upcoming.slice(0, 4) as x (x.m.id)}
        <MilestoneCard milestone={x.m} s={x.s} />
      {/each}
    {:else}
      <a class="kit-row" href="/settings/milestones" data-milestones-empty>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.home_milestones_empty_title()}</span>
          <span class="kit-row-sub">{m.home_milestones_empty_body()}</span>
        </span>
      </a>
    {/if}
  </ListCard>

  <SectionHeading text={m.last_seven()}>
    {#snippet action()}
      <ChartPicker
        key="home-metric"
        label={m.colour_days_by()}
        value={vocabulary.activeMetric}
        options={metricOptions}
        onPick={(value) => selectMetric(value === 'mood' ? null : value)}
      />
    {/snippet}
  </SectionHeading>
  <WeekStrip metric={vocabulary.activeMetric} role={roleAt(activeFlag.roles, AREA_ROLE.week)} />
  <!-- The streak, as the caption on the week it describes. -->
  {#if streak > 1 && !pausedToday}
    <p class="home-week-caption" data-home-streak="week">{streak} {m.streak_row()}</p>
  {/if}

  <SectionHeading text={m.recent_entries()}>
    {#snippet action()}
      <a class="kit-heading-action" href="/calendar">{m.nav_calendar()}</a>
    {/snippet}
  </SectionHeading>
  <div class="home-swap">
    {#if recent.loading}
      <div out:crossfade><Skeleton variant="card" count={3} /></div>
    {:else if dayGroups.length}
      <div class="home-days">
        {#each dayGroups as group (group.epochDay)}
          <DayCard
            key={String(group.epochDay)}
            role={roleAt(activeFlag.roles, AREA_ROLE.days)}
            date={fmtDay(group.epochDay, { weekday: 'long', day: 'numeric', month: 'long' })}
            aside={group.dayCount > 1 ? m.entry_day_count({ count: String(group.dayCount) }) : undefined}
          >
            {#each group.entries as entry (entry.id)}
              <DayEntry
                key={String(entry.id)}
                href={`/entry/${entry.id}`}
                time={fmtTime(entry.timestamp)}
                mood={entry.mood}
                note={entry.note ?? undefined}
                tags={entryTags(entry)}
                marks={entryMarks(entry)}
              />
            {/each}
          </DayCard>
        {/each}
      </div>
    {:else}
      <!-- Wrapped because a transition goes on an element, not a component,
           and the empty state is the branch a first-run journal lands on -
           it owes the same crossfade the day cards get. -->
      <div>
        <Notice
          icon="book"
          key="no-entries"
          role={roleAt(activeFlag.roles, AREA_ROLE.days)}
          title={m.empty_home_title()}
          text={m.empty_home_body()}
          action={{ label: m.new_entry(), primary: true, onclick: () => (ui.chooserOpen = true) }}
        />
      </div>
    {/if}
  </div>

  <Sheet
    open={dimsPromptEntryId !== null}
    title={m.quick_log_dims_title()}
    onClose={() => (dimsPromptEntryId = null)}
  >
    {#if dimsPromptEntryId !== null}
      <div data-quick-log-dims>
        <h3>{m.quick_log_dims_title()}</h3>
        <p class="muted small" style="margin-bottom:var(--space-4)">{m.quick_log_dims_hint()}</p>
        <!-- A number input rather than DimensionSlider (EntryEditor.svelte):
             the ticket's acceptance detail is placeholder text that clears
             on focus with nothing to delete first, which only a real
             placeholder attribute gives for free - a slider has no such
             concept, and it also can't tell "skipped" apart from "chosen the
             midpoint" the way an empty input can. -->
        {#each vocabulary.activeDimensions as dim (dim.key)}
          <div class="field">
            <label class="field-label" for={`qld-${dim.key}`}>{dim.name}</label>
            <input
              class="input"
              type="number"
              id={`qld-${dim.key}`}
              data-qld-input={dim.key}
              inputmode="decimal"
              min={dim.min}
              max={dim.max}
              placeholder={m.dim_value_placeholder({ n: String(Math.round((dim.min + dim.max) / 2)) })}
              bind:value={dimInputs[dim.key]}
            />
            <div class="dim-ends"><span>{dim.low}</span><span>{dim.high}</span></div>
          </div>
        {/each}
        <div class="stack-3">
          <button class="btn btn-primary" data-qld-add onclick={saveQuickLogDims}><span>{m.quick_log_dims_add()}</span></button>
          <button class="btn btn-ghost" data-qld-skip onclick={() => (dimsPromptEntryId = null)}><span>{m.not_now()}</span></button>
        </div>
      </div>
    {/if}
  </Sheet>
</div>
