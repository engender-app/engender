<script lang="ts">
  /* The wrapped screens (phase 4 features ticket 01, rebuilt by phase 5 UX
     ticket 23, which also closes specs 06 and 07).

     One route for four views. Three of them are the completed cadences -
     all three ask the journal the same question, `recap(from, to)` over a
     finished period, and differ only in which period that is and how the
     answer is laid out. The fourth is `range`, an arbitrary period somebody
     picked, which is what the deleted `/recap` screen used to be: it read
     the same seam, had no gate and no floor, and stepped through a carousel.
     Wrapped is the survivor because it has a name in the glossary, a card on
     Home, notifications, a share card and an Android launch route, and
     because recap re-implemented display logic this route already had.

     A range gets the gate and the floor too. A person who has turned
     wrapped off has said they do not want a retrospective, and a second
     surface quietly ignoring that was a bug rather than a feature.

     Nothing here is stored and nothing is cached (ADR-0010, CONTEXT:
     Wrapped). Opening this screen recomputes the period from the entries,
     tags, milestones and photos in the journal at that moment, so editing an
     entry from last week and coming back shows the edit rather than a
     snapshot taken when the week ended. That is still true of the four extra
     reads spec 06 adds.

     The layout split is two components: WrappedCompact for a week, a month
     or a range, WrappedYear for a year. */
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtDuration, fmtMonthName } from '$lib/data/dates';
  import {
    calendarDuration,
    dateInputValueFromEpochDay,
    dayRangeEndMin,
    epochDayFromDateInputValue,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { smartBack } from '$lib/navigation/smart-back';
  import { nameTagInsights, recapDimChange, recapTopTags } from '$lib/data/recapDisplay';
  import { wrappedTagInsights, wrappedTallyCounts } from '$lib/data/wrappedSections';
  import { wrappedLetters, LETTER_RETROSPECTIVE_LIMIT } from '$lib/data/letterRetrospective';
  import { touchesMutedEra } from '$lib/data/resurfacingConsent';
  import {
    WRAPPED_RANGE_CHOICES,
    parseWrappedRangeParams,
    resolveWrappedRange,
    wrappedRangeCadence,
    wrappedRangeQuery,
    type WrappedRangeChoice
  } from '$lib/data/wrappedRange';
  import {
    WRAPPED_CADENCES,
    WRAPPED_ENTRY_FLOOR,
    completedWrappedPeriod,
    type WrappedCadence
  } from '$lib/data/wrapped';
  import type { DayAverage } from '$lib/data/journal/stats';
  import Icon from '$lib/components/Icon.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import WrappedCompact from '$lib/components/WrappedCompact.svelte';
  import WrappedYear from '$lib/components/WrappedYear.svelte';

  const today = todayEpochDay();
  const todayInput = dateInputValueFromEpochDay(today);

  /* Validated against the cadences rather than cast: the segment comes out
     of a URL, which a bookmark, a typo or an old link can put anything in.
     `range` is a fourth accepted segment and not a cadence - a cadence names
     a completed calendar period, and the launcher's own allow-list
     (android/launch-routes.ts) still accepts exactly the three. */
  let view = $derived(page.params.cadence ?? '');
  let cadence = $derived(
    (WRAPPED_CADENCES as readonly string[]).includes(view) ? (view as WrappedCadence) : null
  );
  let isRange = $derived(view === 'range');

  /* Phase 6 ticket 03: the eras an `era` choice can name, and the journal's
     own edges to clamp an open one against - both read once here rather
     than by `wrappedRange.ts`, which stays pure over what it is handed
     (ADR-0010). */
  let erasQuery = liveList((j) => j.eras.getEras());
  let boundsQuery = liveQuery((j) => j.eras.getJournalBounds());
  // Phase 6 ticket 05: which of those eras are muted.
  let mutedQuery = liveQuery((j) => j.eraMutes.getMutedEraUuids());

  /* The picked range lives in the URL rather than in component state, the
     same way a cadence does, so it survives a reload, a back gesture and a
     shared link. */
  let picked = $derived(
    parseWrappedRangeParams(
      page.url.searchParams.get('named'),
      page.url.searchParams.get('from'),
      page.url.searchParams.get('to'),
      today,
      { eraId: page.url.searchParams.get('era'), eras: erasQuery.rows, bounds: boundsQuery.value ?? null }
    )
  );

  let period = $derived(cadence ? completedWrappedPeriod(cadence, today) : null);
  let range = $derived(isRange ? picked.range : period ? { start: period.start, end: period.end } : null);

  /* Phase 6 ticket 05: whether any day the range covers falls inside a
     muted era - not just the two ends, so a wide range with a muted stretch
     in the middle of it is caught too (resurfacingConsent.ts). Checked
     against the whole range regardless of how it was picked: an era chosen
     directly and a cadence that happens to fall inside a muted era are the
     same situation from here. */
  let muted = $derived(
    range ? touchesMutedEra(erasQuery.rows, mutedQuery.value ?? new Set(), range.start, range.end) : false
  );

  /* The four tabs. Ordered shortest first, the way a person thinks about
     looking back, with the arbitrary range last because it is the one that
     asks a question rather than naming a period.

     Home offers one cadence - whichever is freshest - so without this the
     other views would exist and be linked from nowhere, which is the
     regression SH-001 already fixed once for Timeline. */
  const VIEW_TABS: { key: string; label: () => string }[] = [
    { key: 'week', label: () => m.wrapped_cadence_week() },
    { key: 'month', label: () => m.wrapped_cadence_month() },
    { key: 'year', label: () => m.wrapped_cadence_year() },
    { key: 'range', label: () => m.wrapped_cadence_range() }
  ];

  /* `era` names itself - the person's own words for the stretch, not a
     fixed label this record could hold - so `rangeName` below branches on
     it before this is ever indexed. */
  const RANGE_LABEL: Record<Exclude<WrappedRangeChoice, 'era'>, () => string> = {
    prevMonth: () => m.recap_period_previous_month(),
    prevYear: () => m.recap_period_previous_year(),
    d7: () => m.recap_period_7d(),
    d30: () => m.recap_period_30d(),
    d90: () => m.recap_period_90d(),
    ytd: () => m.recap_period_ytd(),
    custom: () => m.recap_period_custom()
  };

  /* Only rows for the fixed choices: an era is offered from the eras the
     person actually has, in its own section of the sheet below. */
  const RANGE_PICKER_CHOICES = WRAPPED_RANGE_CHOICES.filter((choice) => choice !== 'era');

  /* What a date field shows when it holds a date. The row paints it; the
     input over the row is the press target and opens the platform picker. */
  const shownDate = (value: string) => {
    const day = epochDayFromDateInputValue(value);
    return day === null || !Number.isFinite(day)
      ? null
      : fmtDay(day, { day: 'numeric', month: 'long', year: 'numeric' });
  };

  let rangePicker = $state(false);
  /* Bound to the two date fields while the sheet is open. Seeded from the
     URL so reopening the sheet on a custom range shows the range that is
     on screen rather than two empty fields. */
  let customStart = $state('');
  let customEnd = $state('');
  $effect(() => {
    customStart = picked.customStart;
    customEnd = picked.customEnd;
  });

  function chooseRange(choice: WrappedRangeChoice) {
    /* Two of the seven are periods that already have a screen. Sending the
       person there rather than drawing the same period a second way is what
       keeps one period at one URL.

       Every one of these replaces rather than pushes. The seven periods are
       views of one screen, which `screen-transition.ts` already says in as
       many words - it gives `/wrapped/` its own rule so that crossing them
       is tier 3 rather than a navigation. A pushed entry per switch made
       back walk the switcher instead of leaving the screen: change the
       period a few times and the back arrow spent those taps undoing them
       (Alicja, 2026-08-26). It only became visible once `smartBack` started
       working - until then every back control took its fallback route and
       history was never consulted at all. */
    const goesToCadence = wrappedRangeCadence(choice);
    if (goesToCadence) {
      rangePicker = false;
      goto(`/wrapped/${goesToCadence}`, { replaceState: true });
      return;
    }
    if (choice === 'custom') {
      /* The custom range needs both boundaries, so the sheet stays open on
         the fields until it has them. */
      if (!resolveWrappedRange('custom', today, { start: customStart, end: customEnd })) {
        goto(`/wrapped/range${wrappedRangeQuery('custom', { start: customStart, end: customEnd })}`, {
          replaceState: true,
          keepFocus: true,
          noScroll: true
        });
        return;
      }
      rangePicker = false;
      goto(`/wrapped/range${wrappedRangeQuery('custom', { start: customStart, end: customEnd })}`, {
        replaceState: true
      });
      return;
    }
    rangePicker = false;
    goto(`/wrapped/range${wrappedRangeQuery(choice)}`, { replaceState: true });
  }

  /* An era is picked whole, the way every other choice but `custom` is:
     there is nothing half-finished about it, so the sheet closes on the
     first tap. */
  function chooseEra(eraId: string) {
    rangePicker = false;
    goto(`/wrapped/range${wrappedRangeQuery('era', undefined, eraId)}`, { replaceState: true });
  }

  /* The preference is read inside every query rather than around them, so
     that turning wrapped off stops the reads themselves: `run` is called
     synchronously, which makes `prefs.wrappedEnabled` a dependency, and the
     branch means no SQL is ever issued while it is false. Home goes further
     and does not mount its card at all. */
  let on = $derived(prefs.wrappedEnabled);

  let recapQuery = liveQuery((j) =>
    on && range && !muted ? j.stats.recap(range.start, range.end) : Promise.resolve(null)
  );
  let recap = $derived(recapQuery.value);

  let moodTrendQuery = liveList((j) =>
    on && range && !muted ? j.stats.dayAverages('mood', range.start, range.end) : Promise.resolve([])
  );
  let moodTrend = $derived((moodTrendQuery.rows) as DayAverage[]);

  /* The four reads spec 06 adds. Tag insights follow the selected metric,
     the same one the stats hub's own insight card reads: which scale "better
     or worse days" is measured on is one preference with one control, and it
     is set on the screen that draws the scales. */
  let insightsQuery = liveList((j) =>
    on && range && !muted ? j.stats.tagInsights(metricKey(prefs), range.start, range.end) : Promise.resolve([])
  );

  let tallyQuery = liveQuery(async (j) => {
    if (!on || !range || muted) return null;
    const [misgendered, correctlyGendered] = await Promise.all([
      j.stats.tallyTrend('misgendered', range.start, range.end),
      j.stats.tallyTrend('correctly_gendered', range.start, range.end)
    ]);
    return { misgendered, correctlyGendered };
  });

  let insights = $derived(nameTagInsights(wrappedTagInsights(insightsQuery.rows) ?? []));
  let tally = $derived(
    tallyQuery.value ? wrappedTallyCounts(tallyQuery.value.misgendered, tallyQuery.value.correctlyGendered) : null
  );

  /* The year's letters to the future self (phase 5 deepening ticket 13):
     written inside the period and unlocked today, which is the only way a
     past self's words may resurface. A year read only - the compact
     template's week and month have no prose section to put them in, and
     the ticket names the annual recap. Sealed ones never reach the
     component: letterRetrospective.ts answers the seal question. */
  let lettersQuery = liveList((j) =>
    on && cadence === 'year' && !muted ? j.letters.getLetters(LETTER_RETROSPECTIVE_LIMIT) : Promise.resolve([])
  );
  let yearLetters = $derived(
    period && cadence === 'year' && !muted ? wrappedLetters(lettersQuery.rows, period.start, period.end, today) : []
  );

  /* Both templates take the dimension and the tags already named, so neither
     of them has to know that a built-in tag stores a key and takes its
     wording from the catalogue at display time (ticket 05). */
  let dimChange = $derived(recap ? recapDimChange(recap) : null);
  let topTags = $derived(recap ? recapTopTags(recap) : []);

  /* A month, a week and a range are named differently rather than through
     one sentence with the period injected: Polish inflects the month name,
     and the week is named by its two dates instead of by a noun at all
     (docs/ui-copy.md). */
  let rangeName = $derived.by(() => {
    // An era names itself: the person's own word for the stretch, read off
    // the row it was picked from rather than off any fixed label.
    if (picked.choice === 'era') return erasQuery.rows.find((e) => e.id === picked.eraId)?.name ?? '';
    if (picked.choice === 'custom' && picked.range) {
      return `${fmtDay(picked.range.start, { day: 'numeric', month: 'short' })} - ${fmtDay(picked.range.end, {
        day: 'numeric',
        month: 'short'
      })}`;
    }
    return RANGE_LABEL[picked.choice]();
  });

  let title = $derived.by(() => {
    /* The range names itself, and once: the row above the wrapped is the
       control that shows which range is on, so a heading reading "Your Last
       30 days" over a row reading "Last 30 days" said one thing twice a
       centimetre apart (Alicja, 2026-08-25). No "Your" either - the screen
       is already yours. */
    if (isRange) return rangeName;
    if (!period) return m.wrapped();
    if (period.cadence === 'week') return m.wrapped_week_title();
    if (period.cadence === 'month')
      return m.wrapped_month_title({ month: fmtMonthName(period.year, period.month ?? 0) });
    return m.wrapped_year_title({ year: String(period.year) });
  });

  /* What a picked range says about itself while it has no range - a custom
     range with a boundary still missing, or an era the journal has nothing
     to resolve it against (an open bound with no entries at all). Different
     reasons, so different words: "pick two dates" is not what is wrong with
     an era someone already picked. */
  let noRangeReason = $derived(picked.choice === 'era' ? m.recap_era_no_entries() : m.recap_custom_range_required());

  let subtitle = $derived.by(() => {
    // The row above already carries the two dates.
    if (isRange) return range ? m.recap_open_range() : noRangeReason;
    if (!period) return '';
    if (period.cadence === 'week') {
      return m.wrapped_week_range({
        from: fmtDay(period.start, { day: 'numeric', month: 'short' }),
        to: fmtDay(period.end, { day: 'numeric', month: 'short' })
      });
    }
    return period.cadence === 'month' ? m.wrapped_month_intro() : m.wrapped_year_intro();
  });

  /* The share button (ticket 18) only appears once there is a real wrapped
     on screen to share - the same floor the content below it is gated on, so
     the button never opens onto the "not much to look back on yet" notice or
     the off/unknown states. Cadences only: the share screen builds its card
     from a completed period it resolves itself (spec 07 leaves the share
     card unchanged), and there is nothing there for a picked range to be. */
  let canShare = $derived(on && !!cadence && !!recap && recap.entryCount >= WRAPPED_ENTRY_FLOOR);

  /* The journey anchor (phase 5 ticket 25, ADR-0010): independent of the
     period a wrapped screen happens to be showing, so it reads the same
     whichever tab is open - recomputed from the anchor's own date rather than
     anything the recap query returns. */
  let anchor = $derived(vocabulary.journeyAnchor);
  let anchorDuration = $derived(
    anchor ? { name: anchor.name, duration: fmtDuration(calendarDuration(anchor.epochDay, today)) } : null
  );

  let loading = $derived(
    recapQuery.loading || moodTrendQuery.loading || insightsQuery.loading || tallyQuery.loading || lettersQuery.loading
  );
</script>

<div class="screen">
  <ScreenHeader title={m.wrapped()} screen="wrapped" back={() => smartBack('/')}>
    {#snippet actions()}
      {#if canShare}
        <a class="icon-btn press" href="/wrapped/{cadence}/share" aria-label={m.wrapped_share_open()}>
          <Icon name="share" size={22} />
        </a>
      {/if}
    {/snippet}
  </ScreenHeader>

  {#if on && (cadence || isRange)}
    <!-- The same control the Stats hub's range switch is, in its link mode:
         each view is its own screen at its own URL, so switching between them
         is navigation and belongs in history. It used to be a hand-written
         copy of the same classes with no pill on it, so one gesture looked
         like two different controls one tab apart. -->
    <Segmented
      key="wrapped-cadences"
      name={m.wrapped_cadence_group()}
      options={VIEW_TABS.map((tab) => ({ value: tab.key, label: tab.label(), href: `/wrapped/${tab.key}` }))}
      value={view}
    />
  {/if}

  {#if !on}
    <Notice
      icon="info"
      key="wrapped-off"
      title={m.wrapped_off_title()}
      text={m.wrapped_off_body()}
      action={{ label: m.nav_settings(), href: '/settings' }}
      aria-live="polite"
    />
  {:else if !cadence && !isRange}
    <Notice icon="info" key="wrapped-unknown" title={m.wrapped_unknown_title()} text={m.wrapped_unknown_body()} />
  {:else}
    {#if isRange}
      <!-- Which range is on screen, as the one row that changes it. A filter
           that opens a panel taller than the screen scrolls away the thing it
           filters (DIRECTION.md, the calendar's own lesson), so the choices
           are a sheet and this row is the visible record of what is on. -->
      <ListCard>
        <!-- The row is the control, so it carries the dates the range covers
             rather than repeating the name the heading under it already
             gives. -->
        <ListRow
          key="range-picker"
          icon="curve"
          title={picked.range
            ? m.wrapped_week_range({
                from: fmtDay(picked.range.start, { day: 'numeric', month: 'short' }),
                to: fmtDay(picked.range.end, { day: 'numeric', month: 'short' })
              })
            : noRangeReason}
          subtitle={m.cd_range_label()}
          onclick={() => (rangePicker = true)}
        />
      </ListCard>
    {/if}

    {#if isRange && !picked.range}
      <!-- A half-finished custom range: the picker is the screen until it
           has both boundaries. -->
      <Notice icon="info" key="wrapped-range-incomplete" title={noRangeReason} />
      <!-- Held whole rather than filled in as the queries land: every figure
           below is a number, and a 0 that becomes 31 a moment later reads as
           a wrong answer rather than a pending one. -->
    {:else if loading}
      <Skeleton variant="block" count={1} />
    {:else if muted}
      <!-- Phase 6 ticket 05: an era somewhere in this period is muted, so
         nothing is read for it at all - not a thin recap, no recap.
         Checked before the entry-floor branch below, which would otherwise
         read a null recap as "not much here yet" rather than "kept out". -->
      <Notice
        icon="eyeOff"
        key="wrapped-muted"
        title={m.wrapped_muted_title()}
        text={m.wrapped_muted_body()}
        action={{ label: m.eras_title(), href: '/transition/eras' }}
        aria-live="polite"
      />
    {:else if !recap || recap.entryCount < WRAPPED_ENTRY_FLOOR}
      <!-- The same floor Home applies before offering the card, and now the
           same one a picked range gets. Reachable anyway through a bookmark
           or a hand-typed URL, and saying why is better than a screen of
           zeroes. -->
      <div class="wrapped-thin" data-wrapped-thin>
        <h2 class="wrapped-title" data-wrapped-title>{m.wrapped_thin_title()}</h2>
        <p class="muted">
          {m.wrapped_thin_body({ count: recap?.entryCount ?? 0, floor: String(WRAPPED_ENTRY_FLOOR) })}
        </p>
      </div>
    {:else if cadence === 'year'}
      <WrappedYear
        year={period?.year ?? 0}
        intro={subtitle}
        {recap}
        {moodTrend}
        {dimChange}
        {topTags}
        {anchorDuration}
        {insights}
        {tally}
        letters={yearLetters}
      />
    {:else}
      <WrappedCompact
        {title}
        {subtitle}
        {recap}
        {moodTrend}
        {dimChange}
        {topTags}
        {anchorDuration}
        {insights}
        {tally}
      />
    {/if}
  {/if}

  <Sheet open={rangePicker} title={m.wrapped_cadence_group()} onClose={() => (rangePicker = false)}>
    <div class="stack-3">
      <ListCard>
        {#each RANGE_PICKER_CHOICES as choice (choice)}
          {@const goesToCadence = wrappedRangeCadence(choice) !== null}
          <!-- Two of the seven go to a screen of their own rather than
               setting this one's range, so they carry a chevron and never a
               check: a tick on a row that navigates away is a state the
               screen can never be in. -->
          <ListRow
            key={`range-${choice}`}
            title={RANGE_LABEL[choice]()}
            chevron={goesToCadence}
            onclick={() => chooseRange(choice)}
          >
            {#snippet trailing()}
              {#if !goesToCadence && isRange && picked.choice === choice}
                <Icon name="check" size={20} />
              {/if}
            {/snippet}
          </ListRow>
        {/each}
      </ListCard>

      {#if erasQuery.rows.length}
        <!-- The person's own eras, offered the same way `/compare`'s era
             sheet does (phase 6 ticket 03): a stretch they already named,
             picked whole rather than as two dates. -->
        <SectionHeading text={m.eras_title()} />
        <ListCard>
          {#each erasQuery.rows as era (era.id)}
            <ListRow key={`range-era-${era.id}`} title={era.name} chevron={false} onclick={() => chooseEra(era.id)}>
              {#snippet trailing()}
                {#if picked.choice === 'era' && picked.eraId === era.id}
                  <Icon name="check" size={20} />
                {/if}
              {/snippet}
            </ListRow>
          {/each}
        </ListCard>
      {/if}

      {#if picked.choice === 'custom'}
        <!-- The same date rows the compare screen draws: a date is picked,
             not typed, so it reads as a row of a list with the value in the
             display face and Android's own picker behind it rather than as a
             text box (Alicja, 2026-08-25). -->
        <div class="wrapped-range-dates">
          {#each [
            { id: 'wrapped-range-start', label: m.recap_custom_start_label(), value: customStart, min: undefined },
            { id: 'wrapped-range-end', label: m.recap_custom_end_label(), value: customEnd, min: dayRangeEndMin(customStart) }
          ] as field (field.id)}
            {@const shown = shownDate(field.value)}
            <div class="rows-divide date-row">
              <label class="date-row-label" for={field.id}>{field.label}</label>
              <span class="date-row-value">{shown ?? ''}</span>
              <span class="date-row-icon"><Icon name="calendar" size={18} /></span>
              <DatePicker
                id={field.id}
                value={field.value}
                min={field.min}
                max={todayInput}
                invis
                onchange={(next) => {
                  if (field.id === 'wrapped-range-start') customStart = next;
                  else customEnd = next;
                  chooseRange('custom');
                }}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </Sheet>
</div>
