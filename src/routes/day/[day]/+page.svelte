<script lang="ts">
  /* One day (phase 5 UX ticket 22, widened by deepening ticket 21).

     What it was: the day's entries and nothing else. Everything else the app
     recorded that day - the dose, the laser session, the measurement, the lab
     draw, the wear session, the recovery photo, the felt sense, the side
     effect - was findable only by opening the screen that owns it and
     scrolling to the right date. Ticket 04 unified where a day is captured
     (ADR-0044); this is the read side of it.

     What it reads is `journal.day.getDay`, whose sections are a registry
     (day.ts) rather than a list of imports here, so a dated area added later
     reaches this screen without it being edited - and an area registered
     nowhere is a compile error there rather than a screen quietly short of
     one. The screen names no area.

     What a day looks like is DayRecords.svelte, and its reasoning lives
     there: this route owns the epoch day, the read and the gate, and that
     component owns the composition. Split so the composition can be looked
     at against the real tokens without a journal behind it
     (tests/browser-tier/day-gallery.svelte).

     It writes nothing. Editing happens in the editor and in each area's own
     screen, and every row here is a link into one of them.

     Which dates reach this screen, audited when it became worth opening, and
     the ones that deliberately do not:

       reach it - a calendar cell (HeatMap), the editor's back arrow, and, as
       of this ticket, each of on-this-day's look-back days, through its
       heading's own action line.

       do not - an entry anywhere it is drawn, because an entry opens into
       the entry, and on the counterevidence screen that is stated as a rule
       (DIRECTION: an entry there is cited rather than opened); a letter card,
       because the letter is the thing being offered; wrapped, which is ranges
       and has no per-day point to hang a link on; and this screen's own day
       bar, which would link to itself.

       charts - no chart mark in the app is a dated point that takes a press.
       AreaChart draws its line and takes none at all; BarRows takes an
       `onPick`, but its four callers pick a metric or a body region, not a
       day. The one dated grid that does take a press is the calendar's, and
       that already lands here. So there is nothing to repoint: making a
       dated mark tappable is a feature for the chart kit, not a link this
       audit can fix.

       left alone on purpose - the timeline's milestones, which are dated and
       currently open nothing. Nothing on that rail is a control: it is read,
       not operated, and gaps and "you are here" sit in the same list as the
       milestones. Giving one kind of item a tap target is that screen's
       decision to make, not this one's. Home's day bars are the other one,
       and they are a live question rather than a settled exception: the bar
       is `--text-xs` with tight padding, so making it a link needs a touch
       target as well as an href.

     `day` still accepts `today` or an epoch-day number, and still reads it as
     a `$derived` rather than a const: a same-route navigation between two
     days reuses this component, and a plain const would keep the first day it
     saw (see the stale-params note on /entry/[id]). */
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { smartBack } from '$lib/navigation/smart-back';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { DAY_SECTION_KEYS } from '$lib/data/journal/day';
  import { liveListIn, liveQuery } from '$lib/data/live/journal.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import DayRecordsView from '$lib/components/DayRecords.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  let epochDay = $derived(page.params.day === 'today' ? todayEpochDay() : Number(page.params.day));
  let isToday = $derived(epochDay === todayEpochDay());

  /* The query reads `epochDay` before its first await, which is what makes it
     re-run on navigation - see liveQuery's contract. One query for the whole
     screen rather than one per area: the registry reads its sections
     concurrently underneath, and seventeen subscriptions here would be
     seventeen re-runs on a write that any one of them cares about. */
  let dayRead = liveQuery((j) => j.day.getDay(epochDay));
  let day = $derived(dayRead.value);

  /* Margin notes are not one of `day.ts`'s sections (they render with the
     entry they annotate, not as a record of the day they were written on -
     day.ts's own DAY_OPT_OUTS says why): a second, batched read rather than
     a section, over whichever entries this day turns out to hold. Reads
     `day?.entries` before its first await, the same reactivity contract
     `dayRead` above follows. */
  let entryIds = $derived((day?.entries ?? []).map((e) => e.id));
  let marginNotesRead = liveQuery((j) => j.marginNotes.forEntries(entryIds));
  let marginNotesByEntry = $derived(marginNotesRead.value ?? new Map());

  /* What the gate branches on: a day is empty when no section has a row,
     which is not something a single list read can say for itself. Flattening
     every section is the emptiness test and nothing else - the two halves of
     the screen render from `day` directly, because they render differently.

     Off DAY_SECTION_KEYS rather than a list written here, so a section added
     to the registry counts towards "is this day empty" without this line
     being touched. */
  let everythingLogged = liveListIn(dayRead, (records) =>
    DAY_SECTION_KEYS.flatMap((key) => records[key] as unknown[])
  );

  /* Two areas, so two roles in reading order. Role 0 for the entries, which
     is the only index guaranteed to be a colour on all 8 palettes, and role 1
     for everything around them. */
  let entriesRole = $derived(roleAt(activeFlag.roles, 0));
  let alsoRole = $derived(roleAt(activeFlag.roles, 1));
</script>

<div class="screen" data-screen>
  <ScreenHeader
    title={isToday ? m.today() : fmtDay(epochDay, { weekday: 'long' })}
    screen="day"
    back={() => smartBack('/calendar')}
  />

  <ReadGate read={everythingLogged} variant="card" count={2}>
    {#snippet rows()}
      <!-- `day!` because the gate renders this snippet only once the read
           has landed with something, which the compiler cannot see across a
           snippet boundary. -->
      <DayRecordsView {epochDay} records={day!} {entriesRole} {alsoRole} {marginNotesByEntry} />
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="book"
        key="day-empty"
        role={entriesRole}
        title={m.nothing_logged()}
        text={m.nothing_logged_body()}
      />
    {/snippet}
  </ReadGate>

  <!-- "Start an era here" (phase 6 ticket 01): naming a stretch of your own
       timeline is a thought that arrives while looking at the day it starts
       on, so the action is offered where the thought is rather than only on
       /transition/eras. A link and not a button, because it goes somewhere -
       the era editor opens there with this day already in its start bound.
       At ghost weight, under the entry button: adding an entry is what this
       screen is for, and two soft buttons would put the rarer action beside
       it as a peer. A milestone offers nothing of the kind: a milestone is a
       day and an era is a span, and the bridge is one action on a milestone
       if it is ever wanted, not a rule (ADR-0049). -->
  <div class="day-add">
    <button class="btn btn-soft" data-add onclick={() => goto(`/entry/new/${epochDay}`)}>
      <Icon name="plus" size={20} /><span>{m.add_another_entry()}</span>
    </button>
    <a class="btn btn-ghost" data-start-era href={`/transition/eras?start=${epochDay}`}>
      <Icon name="columns" size={20} /><span>{m.era_start_here()}</span>
    </a>
  </div>
</div>
