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
  import { slide } from 'svelte/transition';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { backupAgeDays, backupIsStale } from '$lib/data/backupHealth';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import type { TallyKind } from '$lib/data/types';
  import { isPausedOn } from '$lib/data/journalingPause';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { upcomingMilestones } from '$lib/data/milestoneStatus';
  import { RECENT_ENTRY_CAP, entryMarks, recentDayGroups } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { appWordmark } from '$lib/disguise/identity';
  import { HOME_AREA_ROLE, roleAt } from '$lib/theme/roles';
  import { ui } from '$lib/stores/ui.svelte';

  function tileSlide(node: HTMLElement, { enabled }: { enabled: boolean | undefined }) {
    if (!enabled) return { duration: 0, css: () => '' };
    return slide(node, { axis: 'x', duration: 250 });
  }

  import FlagSun from '$lib/components/FlagSun.svelte';
  import MilestoneCard from '$lib/components/MilestoneCard.svelte';
  import WeekStrip from '$lib/components/WeekStrip.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import WrappedHomeCard from '$lib/components/WrappedHomeCard.svelte';
  import OnThisDayHomeCard from '$lib/components/OnThisDayHomeCard.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import DayCard from '$lib/components/kit/DayCard.svelte';
  import DayEntry from '$lib/components/kit/DayEntry.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import MoodChips from '$lib/components/kit/MoodChips.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Tile from '$lib/components/kit/Tile.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import { hoursMinutesSecondsOf } from '$lib/data/journal/wearSessions';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import { shouldShowSafeSpaceNudge } from '$lib/data/safeSpaceNudge';
  import { disclose } from '$lib/motion/reveal';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  const today = todayEpochDay();

  /* Live tiles data & condition (phase 5 ticket 45, 50). */
  let runningWearQuery = liveQuery((j) => j.wearSessions.getRunningSession());
  let runningWear = $derived(runningWearQuery.value ?? null);
  let nowTick = $state(Date.now());
  $effect(() => {
    if (!runningWear) return;
    const id = setInterval(() => (nowTick = Date.now()), 1000);
    return () => clearInterval(id);
  });
  let runningWearElapsed = $derived(runningWear ? hoursMinutesSecondsOf(nowTick - runningWear.startTimestamp) : null);
  let showWearTile = $derived(prefs.wearTimerEnabled && !!runningWear);

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let activeEpisodes = $derived(activeEpisodesAt(episodesQuery.rows, Date.now()));
  let showDoseTile = $derived(prefs.dosePanelEnabled && activeEpisodes.length > 0);

  let latestBadEntryQuery = liveQuery((j) => j.entries.latestBadMomentEntry());
  let latestBadEntry = $derived(latestBadEntryQuery.value ?? null);
  let showSafeSpaceTile = $derived(
    shouldShowSafeSpaceNudge({
      latestBadEntryId: latestBadEntry?.id,
      dismissedEntryId: prefs.safeSpaceNudgeDismissedEntryId,
      enabled: prefs.safeSpaceNudgeEnabled
    })
  );

  let hasLiveTiles = $derived(showWearTile || showDoseTile || showSafeSpaceTile);

  function dismissSafeSpaceNudge(e?: MouseEvent) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (latestBadEntry) {
      prefs.safeSpaceNudgeDismissedEntryId = latestBadEntry.id;
    }
  }

  /* Which stripe each area of the screen takes is HOME_AREA_ROLE's
     ($lib/theme/roles.ts, where the reason the week strip is out of
     reading order is written down). The celebration shares the
     milestones' colour because it is about a milestone; the backup notice
     takes none, because the flag colours the areas of the journal and
     that one is the app talking about itself. */

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
  let recent = liveList((j) => j.entries.recentDays(RECENT_DAYS));
  let dayGroups = $derived(recentDayGroups(recent.rows, RECENT_ENTRY_CAP));

  let streakQuery = liveQuery((j) => j.stats.streak(today));
  let streak = $derived(streakQuery.value ?? 0);

  /* The journaling pause (phase 5 features ticket 21): the streak caption is
     a nudge, the same as the check-in prompt, so it goes quiet while a pause
     covers today rather than showing a frozen number with nothing to
     explain it. */
  let pausesQuery = liveList((j) => j.journalingPauses.getPauses());
  let pausedToday = $derived(isPausedOn(pausesQuery.rows, today));

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
    <!-- The same swap AppNav.svelte makes on the rail's wordmark, out of
         the same module, and for the reason SCREENS.md gives: disguise
         changes the app's name and icon app-wide, not per screen. The hero
         is the largest text on the screen, so leaving it saying "Gender
         Diary" while the tab, the launcher and the rail all say "Notes"
         undoes the rest of the disguise in one line. Two sites in Settings
         still name the app under disguise; those are ticket 24's screen. -->
    <h1 class="home-hero" data-home-hero translate="no">{appWordmark(prefs.disguise, m.app_name())}</h1>
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
        role={roleAt(activeFlag.roles, HOME_AREA_ROLE.milestones)}
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

  <!-- Live tiles grid (ticket 45): wear timer, dose log, etc.
       Unbordered grid, positioned near the top of Home - above milestones,
       the week strip and recent entries - carrying its own role-coloured
       stripe (HOME_AREA_ROLE.liveTiles). Disappears completely - no heading,
       no gap - when no live tile condition holds. -->
  {#if hasLiveTiles}
    <div transition:disclose>
      <TileGrid
        role={roleAt(activeFlag.roles, HOME_AREA_ROLE.liveTiles)}
        flagFill={activeFlag.fill === 'none' ? undefined : activeFlag.fill}
        data-live-tile-grid
      >
        {#if showWearTile && runningWear && runningWearElapsed}
          <div transition:tileSlide={{ enabled: showDoseTile || showSafeSpaceTile }}>
            <Tile
              key="wear-timer"
              data-wear-running-tile
              data-live-tile="wear-timer"
              title={m.tile_wear_title()}
              value={m.wear_session_duration_hms({
                hours: String(runningWearElapsed.hours),
                minutes: String(runningWearElapsed.minutes),
                seconds: String(runningWearElapsed.seconds)
              })}
              note={m.wear_session_running_since({ time: fmtTime(runningWear.startTimestamp) })}
              href="/settings/wear"
              action={{
                icon: 'stop',
                text: m.wear_session_stop_action(),
                label: m.wear_session_stop_action(),
                attrs: { 'data-wear-stop': '' },
                onclick: async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  await journal.wearSessions.upsertSession({
                    id: runningWear.id,
                    startTimestamp: runningWear.startTimestamp,
                    durationMs: Date.now() - runningWear.startTimestamp,
                    note: runningWear.note
                  });
                }
              }}
            />
          </div>
        {/if}

        {#if showDoseTile}
          <div
            transition:tileSlide={{
              enabled: !!(showWearTile && runningWear && runningWearElapsed) || showSafeSpaceTile
            }}
          >
            <Tile
              key="dose-panel"
              data-dose-panel-tile
              data-live-tile="dose-panel"
              title={m.tile_dose_title()}
              value={activeEpisodes.length > 0 ? activeEpisodes[0].drug : undefined}
              note={undefined}
              href="/doses"
              action={{
                icon: 'plus',
                text: m.doses_add_aria(),
                label: m.doses_add_aria(),
                href: '/doses?add=1',
                attrs: { 'data-dose-add': '' }
              }}
            />
          </div>
        {/if}

        {#if showSafeSpaceTile}
          <div
            transition:tileSlide={{
              enabled: !!(showWearTile && runningWear && runningWearElapsed) || showDoseTile
            }}
          >
            <Tile
              key="safe-space-nudge"
              data-safe-space-nudge-tile
              data-live-tile="safe-space-nudge"
              title={m.safe_space_title()}
              note={m.tile_safe_space_nudge_sub()}
              href="/doubt"
              action={{
                icon: 'x',
                label: m.tile_safe_space_nudge_dismiss(),
                attrs: { 'data-safe-space-nudge-dismiss': '' },
                onclick: dismissSafeSpaceNudge
              }}
            />
          </div>
        {/if}
      </TileGrid>
    </div>
  {/if}

  <!-- The two look-back tiles. The grid is unconditional and each tile
       gates itself on its own preference and its own floor, which is what
       keeps the two halves independent: turning wrapped off unmounts its
       tile and the recap read behind it, and leaves this one's sibling
       exactly where it was. With neither qualifying the grid has no
       children and so no height, and the air around it belongs to its
       neighbours rather than to itself. -->
  <TileGrid
    role={roleAt(activeFlag.roles, HOME_AREA_ROLE.lookBack)}
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
  <ListCard role={roleAt(activeFlag.roles, HOME_AREA_ROLE.milestones)}>
    {#if upcoming.length}
      {#each upcoming.slice(0, 4) as x (x.m.id)}
        <MilestoneCard milestone={x.m} s={x.s} />
      {/each}
    {:else}
      <ListRow
        href="/settings/milestones"
        data-milestones-empty
        chevron={false}
        title={m.home_milestones_empty_title()}
        subtitle={m.home_milestones_empty_body()}
      />
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
  <WeekStrip metric={vocabulary.activeMetric} role={roleAt(activeFlag.roles, HOME_AREA_ROLE.week)} />
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
    <ReadGate read={recent} variant="card" count={3}>
      {#snippet rows()}
        <div class="home-days">
          {#each dayGroups as group (group.epochDay)}
            <DayCard
              key={String(group.epochDay)}
              role={roleAt(activeFlag.roles, HOME_AREA_ROLE.days)}
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
      {/snippet}
      {#snippet empty()}
        <!-- Wrapped because a transition goes on an element, not a component,
             and the empty state is the branch a first-run journal lands on -
             it owes the same crossfade the day cards get. -->
        <div>
          <Notice
            icon="book"
            key="no-entries"
            role={roleAt(activeFlag.roles, HOME_AREA_ROLE.days)}
            title={m.empty_home_title()}
            text={m.empty_home_body()}
            action={{ label: m.new_entry(), primary: true, onclick: () => (ui.chooserOpen = true) }}
          />
        </div>
      {/snippet}
    </ReadGate>
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
          <Field label={dim.name} id={`qld-${dim.key}`}>
            {#snippet children(id)}
              <input
                class="input"
                type="number"
                {id}
                data-qld-input={dim.key}
                inputmode="decimal"
                min={dim.min}
                max={dim.max}
                placeholder={m.dim_value_placeholder({ n: String(Math.round((dim.min + dim.max) / 2)) })}
                bind:value={dimInputs[dim.key]}
              />
              <div class="dim-ends"><span>{dim.low}</span><span>{dim.high}</span></div>
            {/snippet}
          </Field>
        {/each}
        <div class="stack-3">
          <button class="btn btn-primary" data-qld-add onclick={saveQuickLogDims}><span>{m.quick_log_dims_add()}</span></button>
          <button class="btn btn-ghost" data-qld-skip onclick={() => (dimsPromptEntryId = null)}><span>{m.not_now()}</span></button>
        </div>
      </div>
    {/if}
  </Sheet>
</div>

<style>
  /* Ticket 19: widened past .screen's own horizontal padding (negative
     margin) and padded back out to the same inset, so the flag sun's corner
     point lands exactly on the screen's true top right corner rather than
     the padded content edge - matching "centred exactly on the screen's top
     right corner" (DIRECTION.md) - while the greeting text keeps its usual
     alignment with everything below it. overflow: hidden clips the sun's
     bleed to a clean quarter instead of a scrollable overhang; min-height
     keeps that quarter from clipping again against this header's own bottom
     edge before the innermost ring finishes drawing (SUN_OUTER/2 in
     $lib/motion/flagSun.ts).

     175px rather than a var(), because CSS has no way to read a TS export -
     flagSun.test.ts holds this number to SUN_OUTER/2 so the two cannot drift
     silently. What is a var() here is the scale: the breathing loop grows
     every ring to --sun-breathe-scale (theme/base.css) at its cycle's
     midpoint, and the resting radius alone was the reserve until phase 5
     ticket 32.12 - so for part of every cycle the outermost ring grew past
     its own room and overflow: hidden shaved it flat along this header's own
     bottom edge. Multiplying by the same token the breathing keyframe reads
     means the two can only ever agree. */
  .home-header {
    position: relative; z-index: 1;
    padding: calc(var(--space-7) + var(--inset-top)) var(--space-5) var(--space-4);
    /* The one deliberate bleed past the safe area (phase 5 ticket 18). The
       scroll region pads every screen clear of the display cutout; this
       header pulls itself back up by exactly that inset, so the sun's centre
       lands on the window's true top right corner - which is what
       DIRECTION.md asks for - and then pads its own text back down by the
       same amount, so the greeting is as clear of the status bar as any
       other screen's first line. Decoration crosses the inset; nothing
       readable does. */
    margin: calc(-1 * var(--inset-top)) calc(-1 * var(--space-5)) 0;
    overflow: hidden;
    min-height: calc(175px * var(--sun-breathe-scale) + var(--inset-top));
  }
  /* Flat, and clear of the sun.

     It was a gradient clipped to the letterforms, which DIRECTION.md's
     decision 2 rules out outright - colour arrives as flat fill and as
     coloured text, never as a gradient - and which on the nonbinary palette
     ran the word "Diary" through olive on its way from purple to yellow.
     The accent at 38px answers to the 3:1 large-text floor, which is what
     --accent is already held to.

     The width cap is the other half of it. The sun is 350px across and
     centred on the top right corner, so anything running past about two
     thirds of the screen disappears under it - which is what was happening to
     the last two letters of the app's own name. DIRECTION.md says the
     greeting sits clear beneath the sun; the title has to sit clear of it
     too, and the way to do that is to stop the text rather than to move the
     flag.

     :global(), because the desktop-adaptation @container block
     (screens.css) still overrides .home-hero's font-size at 1024px+ and
     that rule stayed put with the other screens' shared breakpoint - a
     scoped selector here would out-specificity it with the added scope
     class, and the desktop size would stop winning. */
  :global(.home-hero) {
    font-family: var(--font-display);
    font-size: 2.4rem; font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--accent);
    max-width: 62%;
  }
  .home-hello { font-size: var(--text-sm); color: var(--text-2); margin-top: var(--space-1); font-weight: var(--weight-medium); max-width: 78%; }

  /* Home's vertical rhythm (phase 5 ticket 21). Written as a margin below
     each surface rather than as a flex gap on the column, because one of
     those surfaces renders empty on most days: the look-back grid holds two
     tiles that each gate themselves, and a gap would charge for the space
     twice - once before the empty grid and once after it - where a margin the
     grid does not have costs nothing at all. So the tiles' air belongs to the
     chip row above them and to the next heading's own padding below, and on a
     day with neither tile the column closes up with nothing to notice.

     --space-3 is the gap DIRECTION.md's decision 3 asks for: 10 to 12 rather
     than the 16 the screens used to run at. */
  .home > * { margin-bottom: var(--space-3); }
  /* Both of these carry their own space and would otherwise be paid twice. */
  .home > :global(.kit-heading),
  .home > :global(.kit-tiles) { margin-bottom: 0; }
  /* The caption belongs to the strip above it, so it sits closer than a
     section does to the next section. */
  .home > :global(.kit-strip) { margin-bottom: var(--space-2); }
  .home > :last-child { margin-bottom: 0; }

  /* The streak, under the greeting. No pill, no accent, no icon and no
     display size: those are what made it read as a score, and DIRECTION.md's
     slop audit names the big-number-plus-label-plus-accent template outright.
     What changed at review is where the line sits, not what it is. */
  .home-streak-wrap {
    display: inline-grid;
    justify-items: start;
    position: relative;
    margin-top: var(--space-2);
  }
  .home-streak {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  /* The second authored moment: past a week's run, arriving on Home throws a
     little confetti over the streak line, once. Over that line and nowhere
     else - the band is a grid row above the text and exactly as wide as it,
     which is what keeps this a mark on one fact rather than a screen effect.

     It plays and stops. DIRECTION.md's tier 4 rules out a second ambient
     *loop*, which is why the celebration card's infinite `cf-fall` was
     deleted rather than moved here; a moment with an end is the same
     category as the sun's entrance, and it spends the authored duration
     twice over.

     Out of the flow, which is what lets the streak sit close under the
     greeting. In flow the band's own height was 22px of permanent gap between
     the two lines, on every day the confetti fires and none of the days it
     does not - a moment cannot be allowed to decide the resting layout.

     It used to sit entirely above the line, and from there the pieces fell
     through the greeting: the band's own top was one line-height under "Hi
     Alice" and the fall started 10px above even that. It starts at the streak
     line's own top edge now (Alicja, 2026-08-25), so what the confetti crosses
     is the fact it is about.

     The two moments then went different ways, which is the point of the
     is-burst variant below. A milestone's falls, and falls far enough to cross
     its notice. A streak's is thrown: it goes up, fans out, tumbles and
     decelerates, because a run of days is something you are keeping up rather
     than something arriving.

     Only transform and opacity move, per the performance contract, and the
     pieces are 5x8 rectangles so there is nothing to rasterize. */
  /* The milestone day's own band. The notice is a full-width card, so the
     pieces cross its top edge rather than a line of text, and the wrapper is
     only here to be the thing they are positioned against. */
  .home-celebrate {
    position: relative;
  }
  .home-cheer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    /* Far enough down to cross the notice it is thrown over rather than
       stopping at its top edge (Alicja, 2026-08-25). */
    height: 46px;
    pointer-events: none;
  }
  /* The streak's, which goes the other way and needs far less room: up from
     the line, not down across a card. */
  .home-cheer.is-burst {
    height: 16px;
  }
  .home-cheer i {
    position: absolute;
    top: 0;
    left: var(--x);
    width: 5px;
    height: 8px;
    border-radius: 1px;
    /* The resting state, which is also where the animation ends: past the
       bottom of the band and invisible. Declared so the 1ms clamp has
       somewhere true to strand it (tests/motion-system.test.ts). */
    opacity: 0;
    transform: translateY(46px) rotate(var(--r));
    animation: cheer-fall calc(var(--dur-authored) * 2) linear var(--d) both;
  }
  .home-cheer i:nth-child(3n) { background: var(--accent); }
  .home-cheer i:nth-child(3n + 1) { background: var(--accent-2); }
  .home-cheer i:nth-child(3n + 2) { background: color-mix(in oklab, var(--accent) 50%, var(--accent-2)); }
  /* Same single interval, for the same reason. This one is linear, so position
     and opacity both move steadily and tracking each other is all it takes. */
  @keyframes cheer-fall {
    0% { transform: translateY(-2px) rotate(0deg); opacity: 0; }
    12% { opacity: 1; }
    100% { transform: translateY(46px) rotate(var(--r)); opacity: 0; }
  }

  /* Thrown rather than dropped: up, out and tumbling, on --ease-out so the
     pieces decelerate towards the top the way something thrown does at its
     apex. It stops 13px above the line and is already fading by then, which is
     what keeps it off the greeting - the pieces reach the bottom of that line's
     box at their faintest rather than crossing the words (Alicja, 2026-08-25:
     "it shouldn't cover the 'hi alice' text too much").

     Shorter than the fall, because a throw is over faster than a drop, and the
     resting values here are restated rather than inherited: this rule is where
     the animation is declared, so this is where the 1ms clamp has to find the
     end state (tests/motion-system.test.ts). */
  .home-cheer.is-burst i {
    opacity: 0;
    transform: translate(var(--dx, 0), -11px) rotate(var(--r));
    animation: cheer-burst calc(var(--dur-authored) * 2) var(--ease-out) var(--d) both;
  }
  /* One fade interval, from just after the throw to the very end, and no stops
     in between. That is what puts the opacity on the same curve as the
     position, which is the thing that was wrong: a timing function eases each
     keyframe interval separately, so holding opacity at 1 until a third of the
     way through gave the transform - specified at 0% and 100% only, and so
     eased across the whole duration - time to arrive and park before the fade
     had started. The piece stopped, then disappeared (Alicja, 2026-08-25).

     Sharing the interval means sharing the easing: the fade goes fast early and
     slowly late, exactly as the travel does, so a piece is dimming the whole
     way up and is nearly gone by the time it reaches the top. */
  @keyframes cheer-burst {
    0% { transform: translate(0, 2px) rotate(0deg); opacity: 0; }
    10% { opacity: 1; }
    100% { transform: translate(var(--dx, 0), -11px) rotate(var(--r)); opacity: 0; }
  }
  /* Substituted rather than clamped: at 1ms this is a flicker, and the moment
     it stands for is "well done", which the line underneath already says. */
  :global(html[data-a11y-motion='reduce']) .home-cheer i { animation: none; }
  /* The burst needs saying separately in the media block below: `.home-cheer i`
     is one class and this is two, so without it the more specific rule keeps
     its animation and the clamp turns a thrown piece into a 1ms flicker. The
     attribute selector above already outweighs it. */
  :global(html[data-a11y-motion='reduce']) .home-cheer.is-burst i { animation: none; }
  @media (prefers-reduced-motion: reduce) {
    .home-cheer i { animation: none; }
    .home-cheer.is-burst i { animation: none; }
  }

  /* Tier 3: the skeleton crossfades into the day cards. Both children sit in
     one grid cell so they overlap for the length of the fade - side by side
     in the flow, the outgoing skeleton would push the content it is handing
     over to down the page. */
  .home-swap { display: grid; }
  .home-swap > * { grid-area: 1 / 1; }
  .home-days { display: grid; gap: var(--space-3); align-content: start; }
</style>
