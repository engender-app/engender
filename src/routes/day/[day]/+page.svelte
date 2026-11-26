<script lang="ts">
  /* This route owns the day parameter, reads and gates. DayRecords renders
     the dated areas. Those areas register with journal.day.getDay, so a new
     section needs no route changes. This view is read-only. Each record
     links to its own editor or screen.

     The day parameter accepts today, a nonnegative epoch day or a valid ISO
     date. Derive it from the route so same-route navigation updates the reads.

     Future days show scheduled doses with the drug and amount, plus records
     already dated ahead of time. A matching visit or milestone replaces its
     mark. Marks carry no amounts (ADR-0067). Future days hide the empty-log
     notice, add-entry button and era-start link. dayAhead clamps its read at
     today, so past days return no upcoming marks. Today shows upcoming rows
     first and logged records below. */
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { withListReturn } from '$lib/navigation/sourceRecord';
  import { m } from '$lib/paraglide/messages';
  import { crossesCalendarYear } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { untrack } from 'svelte';
  import { fmtDay } from '$lib/data/dates';
  import { parseDayParam } from '$lib/data/dayParam';
  import { DAY_SECTION_KEYS } from '$lib/data/journal/day';
  import { liveList, liveListIn, liveQuery } from '$lib/data/live/journal.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { dayAheadRows } from '$lib/components/dayAheadRows';
  import { attributeDrug, expectedDosesOnDay } from '$lib/data/regimenEpisode';
  import Icon from '$lib/components/Icon.svelte';
  import DayRecordsView from '$lib/components/DayRecords.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';

  let parsedDay = $derived(parseDayParam(page.params.day, untrack(currentDay)));
  let epochDay = $derived(parsedDay ?? 0);
  let isToday = $derived(epochDay === currentDay());
  let isFuture = $derived(epochDay > currentDay());

  /* The query reads `epochDay` before its first await, which is what makes it
     re-run on navigation - see liveQuery's contract. One query for the whole
     screen rather than one per area: the registry reads its sections
     concurrently underneath, and seventeen subscriptions here would be
     seventeen re-runs on a write that any one of them cares about. */
  let dayRead = liveQuery((j) =>
    parsedDay === null ? Promise.resolve(null) : j.day.getDay(epochDay)
  );
  let day = $derived(dayRead.value);

  /* One mark's worth of range - `fromEpochDay` and `toEpochDay` are both
     this screen's own day, the same reason HeatMap asks for a month and
     Home will ask for just today. */
  let dayAheadRead = liveList((j) =>
    parsedDay === null ? Promise.resolve([]) : j.dayAhead.getDayAhead(epochDay, epochDay, currentDay())
  );

  /* What the schedules expect on this day, which a mark cannot say
     (audit item 12): a mark is a day and a kind, never an amount
     (ADR-0067), so the row that says "Dose" and nothing else was the
     Today agenda's row with less on it. Read here rather than folded into
     `dayAhead`, the call `rowForward.ts` makes for the same reason - names
     and amounts come off the records, and the registry keeps answering
     only which days carry a mark.

     All three reads are issued before the first await, which is what makes
     a liveQuery find its dependencies on the first run (journal.svelte.ts).
     Bounded to a future day: a past day's doses are records, and `day.ts`
     already draws them. */
  let expectedDosesRead = liveQuery(async (j) => {
    const asked = epochDay;
    if (parsedDay === null || asked <= currentDay()) return [];
    const [episodes, schedules, pauses] = await Promise.all([
      j.regimen.getEpisodes(),
      j.doses.getSchedules(),
      j.doses.getPauses()
    ]);
    return expectedDosesOnDay(episodes, schedules, pauses, asked);
  });
  let expectedDoses = $derived(expectedDosesRead.value ?? []);

  /* The marks, less the ones the day's own records name better (audit item
     12). An appointment and a milestone both put a row on this screen
     through `day.ts` carrying what they are - a kind and a place, a name -
     and the mark beside it would be the same fact drawn again with less on
     it. A surgery day and a letter unlock have no such row: a procedure's
     own record on a day is its recovery photos, and a letter that has not
     opened deliberately carries no title anywhere (letters.ts's
     `getUnlockDaysInRange`). The dose slot keeps its row and gains what the
     schedule expects. */
  let namedByRecords = $derived(
    new Set([
      // A visit only: a referral or an update on this day is not the visit
      // the mark stands for.
      ...(day?.appointments.some((a) => a.event === 'visit') ? ['appointment'] : []),
      ...((day?.milestones.length ?? 0) > 0 ? ['milestone'] : [])
    ])
  );
  let comingRows = $derived(
    dayAheadRows(dayAheadRead.rows.filter((mark) => !namedByRecords.has(mark.kind))).flatMap((row) =>
      row.key === 'coming-doseSlot' && expectedDoses.length > 0
        ? expectedDoses.map((dose) => ({
            ...row,
            key: `coming-dose-${dose.episodeId}-${dose.indexInDay}`,
            title: dose.drug,
            subtitle: [
              dose.amount ? m.adherence_slot_amount({ dose: dose.amount.dose, unit: dose.amount.doseUnit }) : '',
              dose.dosesPerDay > 1 ? m.adherence_slot_numbered({ index: dose.indexInDay + 1, count: dose.dosesPerDay }) : ''
            ]
              .filter(Boolean)
              .join(' · ')
          }))
        : [row]
    )
  );

  /* Whether this day holds a record of its own at all. On a future day that
     is an appointment or a milestone dated ahead; every other section reads
     what happened and answers with nothing. Off DAY_SECTION_KEYS rather
     than a list here, the same reason `everythingLogged` below is. */
  let hasRecords = $derived(
    day != null && DAY_SECTION_KEYS.some((key) => (day![key] as unknown[]).length > 0)
  );

  /* Whether a chained read's landed value actually answers for the ids the
     screen is asking about right now, rather than an earlier (or the very
     first, vacuous) set - the same keyed-answer idiom detailDraft.svelte.ts
     uses for a route id, widened to a list. Needed because `LiveQuery.loading`
     is one-way (readState.ts): `marginNotesRead`'s and `doseDrugsRead`'s very
     first run answers for an empty id list (the day read hasn't landed yet),
     which settles in a frame or two and never reports loading again, so a
     gate that trusted `.loading` alone would open on that empty answer and
     the real one would land a few frames later - ticket 174's bug. */
  function sameIds<K>(a: readonly K[], b: readonly K[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
  }

  /* Margin notes are not one of `day.ts`'s sections (they render with the
     entry they annotate, not as a record of the day they were written on -
     day.ts's own DAY_OPT_OUTS says why): a second, batched read rather than
     a section, over whichever entries this day turns out to hold. Reads
     `day?.entries` before its first await, the same reactivity contract
     `dayRead` above follows. Tagged with the ids it answered for (see
     `sameIds` above) so the gate below can tell a landed answer from a stale
     one apart. */
  let entryIds = $derived((day?.entries ?? []).map((e) => e.id));
  /* What the add-entry button says: "another"
     is wrong on a day that holds no entry. Decided by the landed read, so a
     day still loading keeps the wording a day with entries has. */
  let noEntryYet = $derived(day != null && day.entries.length === 0);
  let marginNotesRead = liveQuery(async (j) => {
    const ids = entryIds;
    return { ids, byEntry: await j.marginNotes.forEntries(ids) };
  });
  let marginNotesAnswer = $derived(
    marginNotesRead.value && sameIds(marginNotesRead.value.ids, entryIds) ? marginNotesRead.value : undefined
  );
  let marginNotesByEntry = $derived(marginNotesAnswer?.byEntry ?? new Map());
  /* Answered for these ids, or gave up trying to - either way the gate
     below has heard back and should stop waiting. Without the `.failed`
     half a rejected chained read left `marginNotesAnswer` undefined
     forever (readState.ts's `loading` is one-way, but a fresh rejection
     after landing is not what `marginNotesAnswer` tracks), so the day's
     gate would spin on its skeleton rather than surfacing the failed
     state a rejection is supposed to reach. */
  let marginNotesReady = $derived(marginNotesAnswer !== undefined || marginNotesRead.failed);

  /* Which drug each logged dose carries: a day row
     names it, so concurrent regimens at the same amount and route stay
     two records there too. attributeDrug at each dose's own timestamp -
     the same question the dose log asks its rows - never the regimen
     active today. Chained off the day read the way the margin notes
     above are, because the registry reads doses but deliberately no
     episodes (day.ts's DAY_OPT_OUTS: a span); a day with no doses needs
     neither read, and until this lands the rows state amount and route
     only rather than borrowing a name. */
  let dayDoses = $derived(day?.doses ?? []);
  let doseDrugIds = $derived(dayDoses.map((dose) => dose.id));
  let doseDrugsRead = liveQuery(async (j) => {
    const doses = dayDoses;
    const ids = doses.map((dose) => dose.id);
    if (doses.length === 0) return { ids, byId: null };
    const episodes = await j.regimen.getEpisodes();
    return { ids, byId: new Map(doses.map((dose) => [dose.id, attributeDrug(episodes, dose)])) };
  });
  let doseDrugsAnswer = $derived(
    doseDrugsRead.value && sameIds(doseDrugsRead.value.ids, doseDrugIds) ? doseDrugsRead.value : undefined
  );
  let doseDrugs = $derived(doseDrugsAnswer?.byId ?? undefined);
  /* Same reasoning as `marginNotesReady` above. */
  let doseDrugsReady = $derived(doseDrugsAnswer !== undefined || doseDrugsRead.failed);

  /* What the gate branches on: a day is empty when no section has a row,
     which is not something a single list read can say for itself. Flattening
     every section is the emptiness test and nothing else - the two halves of
     the screen render from `day` directly, because they render differently.

     Off DAY_SECTION_KEYS rather than a list written here, so a section added
     to the registry counts towards "is this day empty" without this line
     being touched. */
  let everythingLogged = liveListIn(dayRead, (records) =>
    records ? DAY_SECTION_KEYS.flatMap((key) => records[key] as unknown[]) : []
  );

  /* `everythingLogged` widened to also hold for the day's two chained reads,
     the same "reveal once, when everything has answered" call ticket 146
     made for Home's fold: the records draw once, already carrying their
     margin notes and dose drug names, rather than gaining them a few frames
     after the gate opens. A day with no records needs neither
     chained read to have anything real to wait for - `entryIds`/`dayDoses`
     are `[]` there, so both settle on the same frame the day read does. */
  let dayRecordsReady = $derived(!everythingLogged.loading && marginNotesReady && doseDrugsReady);
  let dayRecordsRead = {
    get rows() {
      return everythingLogged.rows;
    },
    get loading() {
      return !dayRecordsReady;
    },
    get empty() {
      return dayRecordsReady && everythingLogged.empty;
    },
    /* Any of the three failing surfaces as failed, not only the day read
       itself - a rejected chained read is not "nothing to show", it is
       the same failure `Notice`'s retry button exists for. */
    get failed() {
      return everythingLogged.failed || marginNotesRead.failed || doseDrugsRead.failed;
    },
    get stale() {
      return everythingLogged.stale;
    },
    retry: () => {
      everythingLogged.retry();
      marginNotesRead.retry();
      doseDrugsRead.retry();
    }
  };

  /* Two areas, so two roles in reading order. Role 0 for the entries, which
     is the only index guaranteed to be a colour on every palette, and role 1
     for everything around them. */
  let entriesRole = $derived(roleAt(activeFlag.roles, 0));
  let alsoRole = $derived(roleAt(activeFlag.roles, 1));
</script>

<div class="screen" data-screen>
  <ScreenHeader
    title={parsedDay === null
      ? m.nav_calendar()
      : isToday
      ? m.today()
      : fmtDay(epochDay, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          ...(crossesCalendarYear(epochDay, currentDay()) ? { year: 'numeric' } : {})
        })}
    screen="day"
    back="/calendar"
  />

  {#if parsedDay === null}
    <Notice key="day-unavailable" title={m.source_record_unavailable()} />
  {:else}
  <!-- What is coming (ADR-0067): today and a future day both read it, a
       past day never does (dayAhead.ts's own floor leaves `comingRows`
       empty there, so nothing below ever draws). The heading is the
       appointments screen's own "Coming up" - CONTEXT.md names the same
       concept the same way, and reusing it says one thing once rather than
       drawing a second string for it.

       The role is `entriesRole` on a future day and `alsoRole` on today,
       not the same one always: a future day shows only this card (or only
       the empty notice below), which is the "one surface, one screen" case
       role 0 exists for - the only index guaranteed a colour on all 8
       palettes (`entriesRole`'s own comment below). On today this card sits
       beside the entries card, which already claims role 0, so it takes
       role 1 the same way the day's own "also this day" list does. -->
  {#if comingRows.length > 0}
    <SectionHeading text={m.coming_up_title()} />
    <ListCard role={isFuture ? entriesRole : alsoRole}>
      {#each comingRows as row (row.key)}
        <ListRow key={row.key} icon={row.icon} title={row.title} subtitle={row.subtitle} href={row.href} />
      {/each}
    </ListCard>
  {:else if isFuture && !hasRecords}
    <!-- Honest and offers nothing (ADR-0067, out of scope: writing on a
         future day): no add-entry button reaches this branch, and no era
         link either, since both sit inside the `!isFuture` block below. -->
    <Notice
      icon="calendar"
      key="day-ahead-empty"
      role={entriesRole}
      title={m.day_ahead_empty_title()}
    />
  {/if}

  {#if isFuture}
    <!-- What this day already holds, in the words a past day uses for the
         same records (audit item 12): an appointment says its kind and its
         place, a milestone says its name. No gate and no empty state - the
         notice above covers a day with nothing on it, and a skeleton in
         front of a day that may hold nothing would flash on every future
         day somebody opens. -->
    {#if hasRecords}
      <DayRecordsView {epochDay} records={day!} {entriesRole} {alsoRole} {marginNotesByEntry} {doseDrugs} />
    {/if}
  {:else}
    <ReadGate read={dayRecordsRead} variant="card" count={2}>
      {#snippet rows()}
        <!-- `day!` because the gate renders this snippet only once the read
             has landed with something, which the compiler cannot see across a
             snippet boundary. -->
        <DayRecordsView {epochDay} records={day!} {entriesRole} {alsoRole} {marginNotesByEntry} {doseDrugs} />
      {/snippet}
      {#snippet empty()}
        <Notice
          icon="book"
          key="day-empty"
          role={entriesRole}
          title={m.nothing_logged()}
        />
      {/snippet}
    </ReadGate>

    <!-- "Start an era here": naming a stretch of your own
         timeline is a thought that arrives while looking at the day it starts
         on, so the action is offered where the thought is rather than only on
         /settings/eras (redesign ticket 16: the era manager, moved). A link
         and not a button, because it goes somewhere - the era editor opens
         there with this day already in its start bound. At ghost weight,
         under the entry button: adding an entry is what this screen is for,
         and two soft buttons would put the rarer action beside it as a peer.
         A milestone offers nothing of the kind: a milestone is a day and an
         era is a span, and the bridge is one action on a milestone if it is
         ever wanted, not a rule (ADR-0049). -->
    <div class="day-add">
      <button class="btn btn-soft" data-add onclick={() => goto(withListReturn(`/entry/new/${epochDay}`, page.url))}>
        <Icon name="plus" size={20} /><span>{noEntryYet ? m.add_entry_for_day() : m.add_another_entry()}</span>
      </button>
      <a class="btn btn-ghost" data-start-era href={`/settings/eras?start=${epochDay}`}>
        <Icon name="era" size={20} /><span>{m.era_start_here()}</span>
      </a>
    </div>
  {/if}
  {/if}
</div>
