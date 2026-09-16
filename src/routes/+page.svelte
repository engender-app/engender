<script lang="ts">
  /* Today (phase 10 redesign ticket 13; ADR-0067, ADR-0073, ADR-0074).

     The first screen faces forward. It used to open by asking how you feel
     and put everything with a date on it below the fold, capped, in one
     section; every other door in the app reads backwards, so the app had no
     present tense. The order now is what is happening, what is coming, and
     how to write something down: the running tier of the live tiles, then
     the agenda (ticket 04's projection over the one forward read), then the
     notices with their dates in their own copy, then the log strip - the
     mood pick as one write shape among the others a tap can start - then the
     waiting and dormant tiles, capped and folded as ADR-0039 left them, then
     the rows the person pinned (ticket 05's resolution), then getting
     started while the journal is young.

     This screen draws; it decides nothing twice. The agenda is
     `readAgenda`'s, the pins are `pinnedRows`'s, the tiles are
     `homeTiles`'s, and the words a mark is drawn with are the day view's
     own (`dayAheadMarkLabel`). Nothing here adds a tile kind, a mark or a
     notice.

     What left with this ticket, each to the door that now draws it: the
     week strip and the recent entries to the Journal door (ticket 10), the
     two look-back teasers to the Look back door (ticket 11), and the
     milestones list, whose next dates are agenda rows now and whose
     timeline is a row on the Look back door and a screen of its own under
     the Transition door. Earlier departures, for the record: the tally
     buttons (quick add, ticket 18), the doubt-journal card (a hub row), and
     the streak (phase 8 UX ticket 01).

     Under disguise the agenda is absent - `readAgenda` returns null before
     either read runs (ADR-0074) - the sun does not draw (ADR-0035) and the
     field is grey; the log strip, the tiles and the pinned rows are still
     here, so the app is thinner rather than useless.

     Colour comes from the flag, categorically (DIRECTION.md rule 3): each
     area takes one stripe as its own, off HOME_AREA_ROLE, where the two
     areas out of reading order say why. The notices take none, because the
     flag colours the areas of the journal and a notice is the app talking
     about itself. */
  import { navigating, page } from '$app/state';
  import { goto } from '$app/navigation';
  import { replaceRoute } from '$lib/navigation/smart-back';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { backupAgeDays, backupIsStale } from '$lib/data/backupHealth';
  import { ui } from '$lib/stores/ui.svelte';
  import { fmtDay } from '$lib/data/dates';
  import type { TallyKind } from '$lib/data/types';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { upcomingMilestones } from '$lib/data/milestoneStatus';
  import { debriefOfferVisible } from '$lib/data/vocabulary/entryTemplates';
  import { mostRecentPastAppointment } from '$lib/data/journal/appointments';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { appWordmark } from '$lib/disguise/identity';
  import { HOME_AREA_ROLE, flagBarRole, roleAt, tileRoleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import { readAgenda } from '$lib/data/agendaReads';
  import { passedSlotSentence } from '$lib/data/agenda';
  import { fallbackReading, pinnedRows, shownAgendaKinds } from '$lib/data/pinnedRows';
  import { hubRowLine, hubRowTitle } from '$lib/data/vocabulary/hubLabels';
  import { readRowForward } from '$lib/data/rowForwardReads';
  import { dayAheadMarkLabel } from '$lib/components/dayAheadRows';

  import FlagSun from '$lib/components/FlagSun.svelte';
  import TodayEditor from '$lib/components/TodayEditor.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import MoodChips from '$lib/components/kit/MoodChips.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Tile from '$lib/components/kit/Tile.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import {
    depletingStocks,
    isStockNoticeSnoozed,
    snoozeStockNotice
  } from '$lib/data/stockProjection';
  import { stockNotice } from '$lib/data/vocabulary/stockLabel';
  import { toast } from '$lib/stores/toasts.svelte';
  import { collapse, disclose, markSlotReplacement } from '$lib/motion/reveal';
  import { drumIn, drumOut } from '$lib/motion/drum';
  import { fadeOnly, motionDuration } from '$lib/motion/tokens';

  /* A fold's label changes under a standing button - "Ready letter, Active
     tryout" loses a name when a tile is closed - and words cut, as a rule
     (ADR-0078); Alicja asked this one for "some very small animation, a
     simple crossfade" on the round-one flipbooks (redesign ticket 25). The
     two labels stack in one grid cell so the button keeps its width while
     they cross, and the fade is --dur-fast, which the clamp takes to zero. */
  const labelFade = (_node: Element) => fadeOnly(motionDuration('--dur-fast'));
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { homeTiles } from '$lib/data/liveTiles.svelte';
  import { splitHomeTiles, type HomeTile } from '$lib/data/liveTiles';
  import Icon from '$lib/components/Icon.svelte';

  const today = todayEpochDay();

  /* Every block on this screen that appears and disappears takes the same
     `skip` (phase 9 carpet ticket 04): a screen leaving should not spend
     240ms folding its own panels up on the way out, and Svelte cannot tell
     "this block's condition went false" from "the page unmounted it". */
  let panel = $derived({ skip: navigating.to !== null });

  /* The live tiles, as one read (deepening ticket 07). Home used to hold
     thirteen queries, eleven predicates and an eleven-ternary count for
     this grid, none of which drew anything by itself; what is left here is
     the `{#each}` and the one sheet a tile opens rather than handles in
     place. */
  let letterDismissSheetOpen = $state(false);
  const liveTiles = homeTiles(today, {
    onLetterDismiss: () => (letterDismissSheetOpen = true)
  });

  /* Three at a time, the rest folded in place (phase 8 UX ticket 01,
     ADR-0055). Expanding raises the cap rather than appending the folded
     ones somewhere else, so the order and the three weights hold whether
     the fold is open or shut - which is what makes it a fold rather than a
     second list.

     The fold names what it is holding rather than counting it: the point of
     a fold over a suppression is that you can tell whether it is worth
     opening without opening it. Two names and a remainder, because three
     titles do not fit a row at 390px. */
  let tilesExpanded = $state(false);
  let tileSplit = $derived(splitHomeTiles(liveTiles.tiles));
  let shownTiles = $derived(tilesExpanded ? liveTiles.tiles : tileSplit.shown);
  /* A dismissal the fold fills in the same tick is a swap, not a panel giving
     its space back, and `collapse` cannot see the difference: the grid keeps
     every slot it had, and by the time the leaving tile's transition is
     created the promoted one is already standing in its slot. Only this list
     knows a promotion happened, so it says so before the DOM is updated -
     `$effect.pre`, which is what puts it ahead of the `{#each}` below.

     Same length, a different membership, and a list that did not grow is
     the whole test. Expanding the fold changes the length, a tile's own
     reading changing leaves the keys alone, and a dismissal with nothing
     left to promote shortens the list - none of those are a swap. Nor is a
     tile entering the list: a wear session started from the strip puts the
     timer at the top and pushes the last shown tile into the fold, which is
     the same length with a different membership, and reading it as a swap
     made the new tile rise and fade out of the fold's box while its slot
     landed whole - a 130px yank with a blank slot for two frames (Alicja,
     redesign ticket 19's flipbooks, wear-start frames 9 and 10). A list
     that grew has a tile arriving, and an arrival comes down from above
     (`collapse`); the tile it displaced leaves as any tile does. */
  let shownKeys: HomeTile['key'][] = [];
  let tileCount = 0;
  $effect.pre(() => {
    const keys = shownTiles.map((tile) => tile.key);
    const total = liveTiles.tiles.length;
    const grew = total > tileCount;
    tileCount = total;
    if (!grew && keys.length === shownKeys.length && keys.some((key) => !shownKeys.includes(key))) {
      /* And the box the leaving tile still occupies, which is the one thing
         only this moment knows: a frame later the promoted tile is standing
         in it. */
      const going = shownKeys.find((key) => !keys.includes(key));
      const slot = going
        ? document.querySelector(`[data-live-tile="${going}"]`)?.getBoundingClientRect()
        : undefined;
      /* And where the replacement is coming from, which is the fold: a tile
         is promoted out of it in the same tick, so travelling out of it is
         what says a swap happened rather than two cards crossfading. Read
         here for the same reason as the slot - a frame later the fold may be
         gone, since the tile it gave up can be the last one it held. */
      const fold = document.querySelector('[data-home-tiles-fold]')?.getBoundingClientRect();
      const box = (rect: DOMRect) => ({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
      markSlotReplacement(slot ? { slot: box(slot), from: fold && box(fold) } : null);
    }
    shownKeys = keys;
  });
  /* What each tier is drawn as. `LIVE_TILE_TIER` says which band a kind is
     in and this says what a band looks like, which is the half that belongs
     to a screen: the same three tiers on another surface could be drawn
     three other ways. Written as one table rather than three filters and
     two near-identical grids, so a tier cannot be given a weight in one
     place and a shape in another.

     Read from two places rather than one `{#each}` since phase 8 features
     ticket 63 (ADR-0067): the today block leads the screen, above the
     agenda, and the rest of the grid sits under the log strip (redesign
     ticket 13), but both still take their weight and
     `data-rows` off this one table, so a tier still cannot be given a shape
     in one place and a different one where it is drawn.

     The tiers are contiguous in the order, so filtering by them keeps each
     block's own order and needs no second sort. Dormant is not here: it is
     not a tile at all but a row of a list, which is the whole of what the
     quiet weight means - except the one row promoted to a Notice below
     (carpet ticket 03), which keeps the dormant tier's gate and snooze but
     draws as a surface asking to be acted on, rather than a line in a
     list. */
  const TILE_BLOCKS = [
    { tier: 'today', weight: 'row', rows: true },
    { tier: 'moment', weight: 'card', rows: undefined }
  ] as const;
  /* Filtered off `shownTiles` rather than recomputed per block below: each
     table row above maps to exactly one of these, and the reorder is that
     the today one is read here and drawn first while moment waits under
     the log strip. */
  let todayTiles = $derived(shownTiles.filter((tile) => tile.tier === 'today'));
  let momentTiles = $derived(shownTiles.filter((tile) => tile.tier === 'moment'));
  let quietTiles = $derived(shownTiles.filter((tile) => tile.tier === 'dormant'));
  /* The felt-sense gap is a nudge to act, not a fact to skim (carpet ticket
     03) - it keeps the dormant tier's gate and snooze (still counted in
     `quietTiles` for the fold/cap math above) but draws as a Notice next to
     the moment tiles instead of a row in the quiet list below them. */
  let feltSenseGapTile = $derived(quietTiles.find((tile) => tile.key === 'active-tryout-tile') ?? null);
  let quietListTiles = $derived(quietTiles.filter((tile) => tile.key !== 'active-tryout-tile'));
  const FOLD_NAMES = 2;
  let foldLabel = $derived.by(() => {
    const names = tileSplit.folded.slice(0, FOLD_NAMES).map((tile) => tile.title).join(', ');
    const rest = tileSplit.folded.length - Math.min(FOLD_NAMES, tileSplit.folded.length);
    return rest > 0 ? m.home_tiles_more({ names, count: String(rest) }) : names;
  });

  /* The count line, and what decides the day-one shape (phase 8 UX ticket
     01). One narrow count over the entry table plus the bounds read the
     eras screen already owns - not the recap, which is scoped to a range
     and pays for six queries including two window functions.

     `null` until the count answers, and the blocks below wait for it rather
     than treating not-yet-known as none: a journal of four hundred entries
     that painted the day-one shape for a frame and then filled in would be
     the app telling somebody their journal was empty. */
  let entryCountQuery = liveQuery((j) => j.entries.countAll());
  let journalBoundsQuery = liveQuery((j) => j.eras.getJournalBounds());
  let entryCount = $derived(entryCountQuery.value);

  $effect(() => {
    if (entryCountQuery.value != null && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('engender-has-entries', entryCountQuery.value > 0 ? '1' : '0');
      } catch {}
    }
  });

  /* The agenda (ticket 04, ADR-0074): one live read over the two fetches
     `readAgenda` makes, absent rather than empty, and absent for every
     input while disguise is on - which the read checks before it asks the
     journal anything. Both preferences it depends on are read inside the
     query's own run, where a change to either re-runs it: disguise, and
     the person's switches over the five kinds (ticket 05), applied to the
     marks before the projection so a kind switched off is not what pushes
     a row into the fold. Its fold is ADR-0039's shape at the agenda's own
     cap, disclosed in place and never a route. */
  let agendaQuery = liveQuery((j) =>
    readAgenda({ dayAhead: j.dayAhead, doses: j.doses }, today, prefs.disguise, shownAgendaKinds(prefs))
  );
  let agenda = $derived(agendaQuery.value ?? null);
  let agendaExpanded = $state(false);
  /* The two fold labels, keyed in the markup so a change crosses (labelFade). */
  let agendaFoldLabel = $derived(
    agendaExpanded ? m.home_tiles_fewer() : m.list_more({ count: agenda?.folded.length ?? 0 })
  );
  let tilesFoldLabel = $derived(tilesExpanded ? m.home_tiles_fewer() : foldLabel);
  let agendaRows = $derived(agenda ? (agendaExpanded ? [...agenda.shown, ...agenda.folded] : agenda.shown) : []);
  /** When a row falls: today, tomorrow, or the day written out. The mark is
      a day and a kind and nothing else, so the day is the whole of the
      second line. */
  function agendaWhen(epochDay: number): string {
    if (epochDay === today) return m.today();
    if (epochDay === today + 1) return m.tomorrow();
    return fmtDay(epochDay, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  const shortWeekday = (epochDay: number) => fmtDay(epochDay, { weekday: 'short' });
  const dayNumber = (epochDay: number) => fmtDay(epochDay, { day: 'numeric' });
  const fullDay = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* The pinned rows (ticket 05, ADR-0073): the person's arrangement, or the
     default resolved from what onboarding was told, over the same two reads
     the Transition door makes and the same line rule, so a pinned row and
     its hub row say the same thing about a quiet area. Both reads or
     neither, for the hub's own reason: a finished row drawn with a reading
     under it for a frame is a wrong state, not a partial one. The order is
     the person's and nothing here sorts it.

     Ticket 106: while queries are resolving, render with quiet standing
     lines rather than an empty list, so the section does not expand by
     ~300px and snap content below downward on hydration. */
  let lastWritesQuery = liveQuery((j) => j.lastWrite.getLastWrites(today));
  let areaStatesQuery = liveQuery((j) => j.areaStates.getAreaStates());
  /* The forward half (phase 11 all-four-doors ticket 02). A pinned row draws
     the same line its hub row does, so it asks the same assembled question -
     the milestones pin said "Nothing logged for 1 year 4 months" over the
     same journal the agenda below it was already drawing a hearing from. */
  let forwardQuery = liveQuery((j) => readRowForward(j, today));
  let reading = $derived(
    lastWritesQuery.value !== undefined && areaStatesQuery.value !== undefined && forwardQuery.value !== undefined
      ? {
          todayEpochDay: today,
          lastWrites: lastWritesQuery.value,
          states: areaStatesQuery.value,
          forward: forwardQuery.value
        }
      : fallbackReading(today)
  );
  let pinned = $derived(pinnedRows(prefs, reading));

  /* Edit mode (ticket 14), which is a state of this block rather than a
     screen of its own: the rows being arranged are these rows, so the
     arrangement happens where they are. Off on arrival every time -
     nothing about a page somebody edited on Tuesday should still be in
     edit mode on Wednesday. */
  let editing = $state(false);

  /* The write shapes a tap can start, beside the mood pick (spec stories
     11 and 12): the four resolvable targets the centre fan offers, with the
     same words, going the same places and making the same writes
     (QuickAdd.svelte). The fan is untouched - it is the fastest way to log
     from anywhere - and this is the same set at rest on the screen, so the
     mood pick is one shape among them rather than the screen's opening
     question. Two of the fan's rows are not here on purpose: "another day"
     needs a date before it can go anywhere and stays the fan's sheet, and
     the effects row is a nudge to a screen, not a write. A dose goes
     to its own screen with the add sheet open, because a dose has a drug
     and an amount to choose; a tally and a wear session resolve in place,
     because neither has anything left to choose, and each says so with the
     save toast rather than a screen.

     Whether a session is running is read off the tiles rather than asked
     again: the wear timer is a live tile of the today tier, and its Stop is
     the same write, so the strip's shape borrows the tile's own action when
     one is up. Starting repeats the kind logged last, as the fan does, and
     asks for it at the tap rather than subscribing. */
  let runningWear = $derived(liveTiles.tiles.find((tile) => tile.key === 'wear-timer') ?? null);

  /* The strip answers a tap (redesign ticket 19; DIRECTION.md rule 10). A
     tally resolves in place, so the state change it makes - today's count
     of that kind going up by one - is shown where the tap landed: the
     glyph rises out of the square and the new count rises in under it
     ($lib/motion/drum), holds long enough to be read, and the glyph comes
     back the same way. The count is read back after the write rather than
     kept here, since the journal is the one that knows it (Mobbin: Life
     Reset shows the logged amount on the card that took the tap, Garmin
     Connect writes "Coffee: 2" under the row). The wear shape's glyph
     changes the same way when a session starts or stops, and its label
     crosses over --dur-fast, which is the one exception ADR-0078 makes for
     a label changing under a standing control. `TALLY_SHOWN_MS` is how
     long a number stays legible, not a motion token: under reduced motion
     the faces cut and the count is still shown for the same time. */
  const TALLY_SHOWN_MS = 1100;
  let tallyShown = $state<Partial<Record<TallyKind, number>>>({});
  const tallyTimers: Partial<Record<TallyKind, ReturnType<typeof setTimeout>>> = {};
  async function logTally(kind: TallyKind) {
    const day = todayEpochDay();
    await journal.tally.log({ epochDay: day, kind });
    toast(m.quick_saved());
    const events = await journal.tally.getEventsOnDay(day);
    tallyShown = { ...tallyShown, [kind]: events.filter((event) => event.kind === kind).length };
    clearTimeout(tallyTimers[kind]);
    tallyTimers[kind] = setTimeout(() => {
      const { [kind]: _, ...rest } = tallyShown;
      tallyShown = rest;
    }, TALLY_SHOWN_MS);
  }
  async function toggleWear(e: MouseEvent) {
    if (runningWear?.action?.onclick) {
      runningWear.action.onclick(e);
      return;
    }
    const kind = (await journal.wearSessions.latestKind()) ?? 'binder';
    await journal.wearSessions.upsertSession({ kind, startTimestamp: Date.now(), durationMs: null });
    toast(m.quick_saved());
  }

  /* Getting started (Alicja, 2026-09-04). Day one is a screen with nothing
     on it once the placeholders are gone, and "write an entry" is the only
     thing it asks for - which is right as the first move and says nothing
     about what the app turns into once there is something in it.

     Five entries rather than one, because a section that vanished the
     moment somebody logged a mood would be gone before they came back to
     read it (Alicja, 2026-09-04). It leaves on its own and there is nothing
     to dismiss: a row that has to be shut is a row that outstayed itself.

     The list is written here rather than read off the hub's own area
     registry. Not every area belongs in it - this is four openings that pay
     off later, not an inventory - and the hub is being rewritten by another
     ticket, so a shared list would be a merge conflict standing in for a
     decision neither ticket made. The last row hands the inventory question
     to the hub, which is whose it is. */
  const GETTING_STARTED_UNTIL = 5;
  let showGettingStarted = $derived(entryCount != null && entryCount < GETTING_STARTED_UNTIL);
  const GETTING_STARTED = [
    { key: 'milestones', icon: 'flag', href: '/transition/milestones', title: m.home_start_milestones_title, sub: m.home_start_milestones_sub },
    { key: 'regimen', icon: 'flask', href: '/settings/regimen', title: m.home_start_regimen_title, sub: m.home_start_regimen_sub },
    { key: 'letters', icon: 'clock', href: '/transition/letters', title: m.home_start_letters_title, sub: m.home_start_letters_sub },
    { key: 'photos', icon: 'camera', href: '/media/photos', title: m.home_start_photos_title, sub: m.home_start_photos_sub },
    { key: 'more', icon: 'grid', href: '/more', title: m.home_start_more_title, sub: m.home_start_more_sub }
  ];

  /* Milestones are mirrored (ADR-0004), so this stays a synchronous derived
     read. The list itself no longer draws here - a milestone still ahead is
     an agenda row - but the day one lands is the one authored moment below,
     and this is the read that knows it. */
  let upcoming = $derived(upcomingMilestones(vocabulary.milestones, today));
  let landing = $derived(upcoming.find((x) => x.s.type === 'today' || x.s.isAnnivToday));
  let celebrate = $derived(page.url.searchParams.get('celebrate') === '1' || !!landing);

  let backupAge = $derived(backupAgeDays(prefs.lastBackupAt, today));
  /* Held back while the app is opening, and only then (redesign ticket 34).
     A notice whose read answers during the unlock's transition is not drawn
     while it arrives - the browser is painting the transition's snapshots -
     so it is simply there in the frame the paint lifts on, with the rows
     below it shoved down. Waiting means it arrives on a screen that has
     stopped moving, which is where a notice opening its own height reads as
     the change it is. Nothing about the read waits; only the appearing. */
  let showBackupNotice = $derived(
    backupIsStale(prefs.lastBackupAt, today) && !prefs.backupNoticeDismissed && !ui.appOpening
  );

  /* The appointment debrief offer (phase 6 ticket 08, rekeyed to an
     appointment id by ticket 58, ADR-0066): the most recent past
     appointment (appointments.ts's own pure selector, over the one read
     the appointments screen already needs), joined with the standalone
     checklist's debrief state scoped to that same id
     (checklists.ts's `getDebriefState`), folded through the pure predicate
     (vocabulary/entryTemplates.ts) rather than re-deriving the rule here.
     Its own `itemCount` rather than a bare presence check, since an
     appointment with no prep item at all still has to read as "nothing to
     prepare for" (What to Build #1) - a checklist that has never been
     created answers that the same way an empty one does. */
  let appointmentsQuery = liveList((j) => j.appointments.getAppointments());
  let lastAppointmentId = $derived(mostRecentPastAppointment(appointmentsQuery.rows, today)?.id ?? null);
  let debriefStateQuery = liveQuery((j) => j.checklists.getDebriefState(lastAppointmentId));
  let showDebriefOffer = $derived(!!debriefStateQuery.value && debriefOfferVisible(debriefStateQuery.value));

  let stockProjectionsQuery = liveList((j) => j.stock.getProjections(today));
  let isStockNoticeSnoozedState = $state(false);
  $effect(() => {
    isStockNoticeSnoozedState = isStockNoticeSnoozed();
  });
  let urgentDepletingStock = $derived(depletingStocks(stockProjectionsQuery.rows, today)[0] ?? null);
  let showStockNotice = $derived(prefs.stockNoticeEnabled && !!urgentDepletingStock && !isStockNoticeSnoozedState);
  let stockNoticeCopy = $derived(
    urgentDepletingStock
      ? stockNotice(
          urgentDepletingStock,
          fmtDay(urgentDepletingStock.actionableEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })
        )
      : null
  );
  let stockDismissSheetOpen = $state(false);

  /* The one authored moment besides the sun: on a milestone day, opening
     Home throws a little confetti over the notice that names it. It plays
     once on arriving and stops - it is not a loop, which is the line
     DIRECTION.md's tier 4 actually draws, and it is why the old celebration
     card's infinite `cf-fall` had to go rather than move here.

     The pieces are a fixed table rather than a random scatter: a moment
     that is different every time cannot be reviewed, and a screenshot of it
     is not evidence of anything. Nine, because that is what fits across the
     notice's width without reading as a shower.

     It threw a second burst over the streak line until phase 8 UX ticket 01
     deleted the streak. */
  const CHEER = [
    { i: 0, x: 4, d: 0, r: 200 },
    { i: 1, x: 17, d: 0.16, r: -260 },
    { i: 2, x: 29, d: 0.07, r: 300 },
    { i: 3, x: 41, d: 0.26, r: -180 },
    { i: 4, x: 52, d: 0.03, r: 240 },
    { i: 5, x: 64, d: 0.2, r: -300 },
    { i: 6, x: 76, d: 0.11, r: 260 },
    { i: 7, x: 87, d: 0.3, r: -220 },
    { i: 8, x: 95, d: 0.05, r: 180 }
  ];

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
    void replaceRoute('/', { noScroll: true, keepFocus: true });
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
    void replaceRoute('/', { noScroll: true, keepFocus: true });
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

{#snippet cheer()}
  <span class="home-cheer" aria-hidden="true">
    {#each CHEER as piece (piece.i)}
      <i style={`--x: ${piece.x}%; --d: ${piece.d}s; --r: ${piece.r}deg`}></i>
    {/each}
  </span>
{/snippet}

<!-- An agenda row's day as a block (rule 3): the weekday small over the day
     number at display weight, on the stripe in the ink proven on it, where
     a row's icon would sit. Hidden from the reader, because the row's own
     second line says the day in full. A passed slot's block is outlined
     rather than filled, so a thing that went by is not drawn like a thing
     coming. -->
{#snippet dayBlock(epochDay: number, passed: boolean)}
  <span class="home-agenda-day" class:is-passed={passed} aria-hidden="true">
    <span class="home-agenda-wd">{shortWeekday(epochDay)}</span>
    <span class="home-agenda-dn">{dayNumber(epochDay)}</span>
  </span>
{/snippet}

<!-- A tally square's face: the glyph, or for a moment after a tap the count
     the tap made, each rising through the block (redesign ticket 19). The
     count is a number on a block at the display size, so it is large text
     and legal on every stripe (DIRECTION.md rule 11); the label under the
     square keeps saying what the square is. -->
{#snippet tallyFace(kind: TallyKind, icon: string)}
  {@const shown = tallyShown[kind]}
  <span class="home-log-ico" data-tally-shown={shown}>
    {#key shown ?? 'glyph'}
      <span class="home-log-face" in:drumIn out:drumOut>
        {#if shown === undefined}<Icon name={icon} size={22} />{:else}<span class="home-log-count">{shown}</span>{/if}
      </span>
    {/key}
  </span>
{/snippet}

<div class="screen home">
  <header class="home-header" data-home-header>
    <!-- The field (phase 10, DIRECTION.md rule 7; ADR-0075): a solid block
         of one of the flag's colours holding two things, the sun in its top
         right corner and the wordmark in its bottom left, under the sun's
         reach. Nothing small sits on it; the hello line, the count and the
         gear are in the foot below, on the page. -->
    <div class="home-field" data-home-field>
      <!-- The blind (redesign ticket 28), first so it paints under both the
           sun and the wordmark: the field's colour, split off from the box
           that measures it so the edge can be pulled to the next screen's
           height while what is drawn on it leaves under its own animation. -->
      <div class="field-blind" data-field-blind aria-hidden="true"></div>
      <!-- Home-only, and never under disguise (ADR-0035) - checked on
           prefs.disguise here rather than inside FlagSun, so the one place
           that decides whether the sun renders at all matches every other
           disguise gate in the app. Under disguise the field itself falls to
           --surface-2 (activeFlag), so this block is a grey header with the
           app's assumed name in it and nothing else. -->
      {#if !prefs.disguise}<FlagSun />{/if}
      <!-- The same swap AppNav.svelte makes on the rail's wordmark, out of
           the same module, and for the reason SCREENS.md gives: disguise
           changes the app's name and icon app-wide, not per screen. The hero
           is the largest text on the screen, so leaving it saying "Gender
           Diary" while the tab, the launcher and the rail all say "Notes"
           undoes the rest of the disguise in one line. Two sites in Settings
           still name the app under disguise; those are ticket 24's screen. -->
      <h1 class="home-hero" data-home-hero data-field-part translate="no">{appWordmark(prefs.disguise, m.app_name())}</h1>
    </div>
    <!-- The foot: one line of who and when, one of how much, and the gear at
         the line's end. On the page rather than the field because all three
         are small type (rule 3), and because a gear in the field's corner
         competed with the wordmark (Alicja, ticket 06 round one). -->
    <div class="home-foot" data-home-foot>
      <div class="home-foot-lines">
        <p class="home-hello" data-home-hello>{prefs.name ? `${m.hello()} ${prefs.name} · ` : ''}{fmtDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <!-- How much is here, and since when. The streak stood in this slot
             and was a run that could break; this only grows. Same size as the
             greeting above it, so the foot reads as today, then history, and
             neither is a score. Absent at zero entries, where "0 entries since
             nothing" is a worse first screen than no line at all.

             A month and a year rather than a day: the day the journal opened
             on is not the fact this line is about. -->
        {#if entryCount && journalBoundsQuery.value}
          <p class="home-count" data-home-count>
            {m.home_count_since({
              entries: m.n_entries({ n: entryCount }),
              date: fmtDay(journalBoundsQuery.value.firstEpochDay, { month: 'short', year: 'numeric' })
            })}
          </p>
        {/if}
      </div>
      <!-- Preferences are chrome, not content, so they leave the fourth door
           and live here (ticket 09, which also gives the rail its fifth item
           and takes the Settings row out of the hub). Placed by ticket 23 as
           part of the foot; a plain link, because an unwired control is a
           dead control. Nothing about a gear says what the app is, so it is
           unremarkable under disguise. -->
      <a class="icon-btn press home-gear" href="/settings" aria-label={m.nav_settings()} data-home-gear>
        <Icon name="settings" size={22} />
      </a>
    </div>
  </header>

  <!-- The anniversary, as one line rather than a card with a confetti loop
       falling through it. The words are the ones it always said; what went
       is the loop, because the flag sun is the whole of the app's ambient
       motion budget and a second one on the same screen spends it twice
       (DIRECTION.md, tiers 0 and 4). It takes the agenda's colour, since a
       milestone landing today is the agenda's own kind of fact. -->
  {#if celebrate}
    <!-- Nine pieces over the notice that says which milestone it is (Alicja,
         2026-08-25: "we want the same confetti animation when it's a
         milestone day"). A moment that plays once and stops costs nothing
         after it stops, and this one fires on the day a milestone lands. -->
    <div class="home-celebrate">
      {@render cheer()}
      <Notice
        icon="sparkle"
        key="celebration"
        role={tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.agenda)}
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

  <!-- One tier's worth of tiles, in `block`'s weight and shape - shared by
       the today location above and the moment location below (phase 8
       features ticket 63), so the two locations cannot read the same table
       and still draw two different shapes for it. -->
  {#snippet tileRow(tiles: HomeTile[], block: (typeof TILE_BLOCKS)[number])}
    {#if tiles.length > 0}
      <TileGrid
        role={tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.liveTiles)}
        bar={flagBarRole(activeFlag.roles, tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.liveTiles))}
        data-live-tile-grid
        data-rows={block.rows}
      >
        <!-- No transition declared here any more (phase 9 carpet ticket 04).
             It used to be a slide of Home's own, on the x axis whatever the
             layout was doing - so at the 390px floor, where this grid is one
             tile per line, a closing tile shrank its width while its
             neighbours were giving back height. `collapse` rides Tile itself
             and reads the axis off the layout, which is the same rule for
             every tile in every grid rather than this screen's guess. -->
        {#each tiles as tile (tile.key)}
          <Tile
            key={tile.tileKey}
            weight={block.weight}
            title={tile.title}
            value={tile.value}
            note={tile.note}
            href={tile.href}
            action={tile.action}
            dismiss={tile.dismiss}
            {...tile.attrs}
            data-live-tile={tile.key}
          />
        {/each}
      </TileGrid>
    {/if}
  {/snippet}

  <!-- The today tier leads Home, above the agenda (phase 8 features
       ticket 63, ADR-0067; redesign ticket 13): what is happening now - a
       wear session running, a dose the day expects, an appointment on the
       date - answers before what is coming does, and both before "how are
       you feeling". A reorder rather than a second grid: this is the same
       today-tier row the block below used to draw in its own turn, only
       moved. Empty, and nothing here renders at all. -->
  {#if todayTiles.length > 0}
    <div transition:collapse={panel}>
      {@render tileRow(todayTiles, TILE_BLOCKS.find((block) => block.tier === 'today')!)}
    </div>
  {/if}

  <!-- The agenda (ticket 04, ADR-0074): the week ahead as a list, since it
       is one (rule 6), each row carrying its day as a block because a date
       is a value (rule 3) and the kind in the day view's own words, going
       to the screen that owns the fact. The block is always one of the
       flag's colours (tileRoleAt, ticket 24's rule for a block): on trans
       the agenda's slot lands on the white band, and a white day block on a
       light page is the outline the passed slot below draws, so the two
       would read as one. Absent rather than empty: a window
       with nothing in it hands the screen nothing to draw, so day one and a
       quiet week both render no heading and no card. The passed slot is
       the one row that looks backwards, stated once with its date under
       the words /coming-back uses, and drawn apart from the dated rows as
       an outlined block rather than a filled one, so it cannot be read as
       the next item on a list. -->
  {#if agenda}
    <div class="home-agenda" transition:collapse={panel} data-home-agenda>
      <SectionHeading text={m.home_agenda_heading()} />
      <ListCard role={tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.agenda)}>
        {#each agendaRows as item, i (item.key)}
          {@const label = dayAheadMarkLabel(item.kind)}
          <!-- Each row owns its height and gives it back (rule 10): a row
               the fold discloses opens rather than appears, and one whose
               day passes closes, the rows under it following. The day
               block on it arrives the way every block does, clipping open
               from its left edge, the rows of one arrival one stagger step
               apart (redesign ticket 19): counted from the first row the
               screen shows, or from the first row the fold lets out, so a
               row arriving out of the fold never waits its turn behind
               rows that were already there (ticket 25's lesson on the
               tiles). Capped where the tiles' stagger is. -->
          <div class="rows-divide" transition:disclose={panel} style:--row-index={Math.min(6, i < agenda.shown.length ? i : i - agenda.shown.length)}>
            <ListRow
              key={item.key}
              href={item.route}
              title={label.title}
              subtitle={agendaWhen(item.epochDay)}
              data-agenda-item={item.kind}
              data-agenda-day={item.epochDay}
            >
              {#snippet leading()}
                {@render dayBlock(item.epochDay, false)}
              {/snippet}
            </ListRow>
          </div>
        {/each}
      </ListCard>
      <!-- Its own list, not the last row of the one above: ADR-0074 gives
           the passed slot its own shape so it can never be sorted among
           the things coming, and a row under the same hairlines would read
           as the next of them however its block was drawn. -->
      {#if agenda.passed}
        <!-- The one row that arrives and leaves on its own, when a slot's
             day passes or the dose is logged: it opens and closes its own
             height like every other row (redesign ticket 19). -->
        <div transition:disclose={panel}>
          <ListCard role={tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.agenda)}>
            <ListRow
              key={agenda.passed.key}
              href={agenda.passed.route}
              title={passedSlotSentence(agenda.passed.epochDay, fullDay)}
              data-agenda-passed={agenda.passed.epochDay}
            >
              {#snippet leading()}
                {@render dayBlock(agenda.passed!.epochDay, true)}
              {/snippet}
            </ListRow>
          </ListCard>
        </div>
      {/if}
      {#if agenda.folded.length > 0}
        <button
          type="button"
          class="home-fold press"
          data-home-agenda-fold
          aria-expanded={agendaExpanded}
          onclick={() => (agendaExpanded = !agendaExpanded)}
        >
          <span class="home-fold-mark" class:is-open={agendaExpanded} aria-hidden="true">
            <Icon name="chevronDown" size={16} />
          </span>
          <span class="home-fold-text">
            {#key agendaFoldLabel}<span transition:labelFade>{agendaFoldLabel}</span>{/key}
          </span>
        </button>
      {/if}
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

  {#if showStockNotice && urgentDepletingStock && stockNoticeCopy}
    <Notice
      icon="alert"
      key="stock-low"
      title={stockNoticeCopy.title}
      text={stockNoticeCopy.body}
      action={{ label: m.notice_stock_manage(), href: '/settings/stock' }}
      dismiss={{
        label: m.notice_stock_dismiss_action(),
        onclick: () => {
          stockDismissSheetOpen = true;
        }
      }}
      aria-live="polite"
      data-stock-notice=""
    />
  {/if}

  <!-- The appointment debrief offer (phase 6 ticket 08): in-app only, per
       the unprompted registry's admission rule (registry.ts) - nothing here
       schedules a notification. Offered once; dismissing or writing about
       it both stop it for good until a newer past appointment supersedes it
       (debriefOfferVisible, checklists.ts, ticket 58). No coloured side
       border and no role, the same reasoning the backup notice's own
       comment gives: this is the app naming an appointment the person
       recorded, not one of the journal's own coloured areas. -->
  {#if showDebriefOffer}
    <Notice
      icon="calendar"
      key="debrief-offer"
      title={m.debrief_offer_title()}
      action={{
        label: m.debrief_offer_write(),
        href: `/entry/new/today?debriefFor=${lastAppointmentId}`
      }}
      dismiss={{
        label: m.dismiss(),
        onclick: () => journal.checklists.setDebriefDismissed(lastAppointmentId!)
      }}
      aria-live="polite"
      data-debrief-offer=""
    />
  {/if}

  <!-- The log strip: every write shape a tap can start, in one place, and
       the mood pick one of them (spec stories 10 to 12). The faces first,
       because a mood is the one that makes today's entry and the habit a
       daily check-in has should not get worse; then the four shapes the
       centre fan offers, as icon squares of the strip's stripe on the page,
       flush between the row's own hairlines. It draws under disguise too,
       every role fallen to the accent, so the thin app still writes. -->
  <SectionHeading text={m.home_log_heading()} />
  <div class="home-log" data-home-log {...roleAttrs(roleAt(activeFlag.roles, HOME_AREA_ROLE.log))}>
    <MoodChips onPick={onQuickLog} />
    <div class="home-log-shapes" role="group" aria-label={m.quick_add_title()}>
      <a class="home-log-shape press" href="/doses?add=1" data-home-log-shape="dose">
        <span class="home-log-ico"><Icon name="clock" size={22} /></span>
        <span class="home-log-label">{m.doses_empty_action()}</span>
      </a>
      <button type="button" class="home-log-shape press" data-home-log-shape="tally-misgendered" onclick={() => void logTally('misgendered')}>
        {@render tallyFace('misgendered', 'x')}
        <span class="home-log-label">{m.tally_misgendered()}</span>
      </button>
      <button type="button" class="home-log-shape press" data-home-log-shape="tally-correctly_gendered" onclick={() => void logTally('correctly_gendered')}>
        {@render tallyFace('correctly_gendered', 'check')}
        <span class="home-log-label">{m.tally_correctly_gendered()}</span>
      </button>
      <!-- One shape, two things, and the label says which - the fan's own
           rule. The glyph changes with it: a running session is a thing to
           stop, and `timeline` is the app's mark for something measured
           between two moments. -->
      <button
        type="button"
        class="home-log-shape press"
        data-home-log-shape="wear"
        data-wear-running={runningWear ? '' : undefined}
        onclick={(e) => void toggleWear(e)}
      >
        <span class="home-log-ico">
          {#key runningWear ? 'stop' : 'timeline'}
            <span class="home-log-face" in:drumIn out:drumOut><Icon name={runningWear ? 'stop' : 'timeline'} size={22} /></span>
          {/key}
        </span>
        <span class="home-log-label home-log-label-cross">
          {#key runningWear ? 'stop' : 'start'}<span transition:labelFade>{runningWear ? m.wear_session_stop_action() : m.wear_session_start_action()}</span>{/key}
        </span>
      </button>
    </div>
  </div>

  <!-- The rest of the live tiles (ticket 45, capped and weighted by phase 8
       UX ticket 01) - the moment weight as a card, the dormant weight as a
       quiet list row. The today tier's own row leads the screen; this
       block never draws it (phase 8 features ticket 63).

       Two shapes rather than the three the grid as a whole has: a moment is
       a card in the two-up grid, and a dormant nudge is a line in a list
       with no action of its own - tapping it opens the screen the action
       lived on. They share one role, so they still read as one area of the
       screen (HOME_AREA_ROLE.liveTiles).

       Separation is an opaque surface and a line: box-shadow is banned in
       the kit and tested for. -->
  {#if momentTiles.length > 0 || quietTiles.length > 0 || tileSplit.folded.length > 0}
    <div class="home-tiles" transition:collapse={panel}>
      {@render tileRow(momentTiles, TILE_BLOCKS.find((block) => block.tier === 'moment')!)}

      <!-- Carpet ticket 03: this one dormant tile gets a Notice instead of a
           quiet row - a stalled tryout is a thing to act on, and the
           snooze/action it already carries (dismissSnooze, the "Log
           feeling" link) were sitting unused under the ListRow's plainer
           tap-through. Same liveTiles role as the tiles beside it: this is
           journal content, not the app talking about itself.

           `dismiss` isn't `feltSenseGapTile.dismiss` straight through, unlike
           `tileRow`'s `dismiss={tile.dismiss}` below: `HomeTileDismiss.onclick`
           takes a MouseEvent, which `Tile.svelte` also declares and forwards
           untouched, but `Notice`'s own `dismiss.onclick` takes none - the
           same snooze (`liveTiles.snooze`, the tile's own `dismissSnooze`)
           called through a zero-arg wrapper `svelte-check` requires here. -->
      {#if feltSenseGapTile}
        <Notice
          icon="heart"
          key="active-tryout-tile"
          role={tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.liveTiles)}
          title={feltSenseGapTile.title}
          text={feltSenseGapTile.note}
          action={{ label: feltSenseGapTile.action!.label, href: feltSenseGapTile.action!.href! }}
          dismiss={{
            label: feltSenseGapTile.dismiss!.label,
            onclick: () => liveTiles.snooze('active-tryout-tile')
          }}
          data-live-tile={feltSenseGapTile.key}
          {...feltSenseGapTile.attrs}
        />
      {/if}

      <!-- The quiet weight. A dormant nudge keeps neither its action nor its
           dismiss: the whole line taps through to the screen its action
           opened anyway, and the fewest controls belong on the quietest
           thing. Its value goes with them - "40 days" is what the note
           already says. -->
      {#if quietListTiles.length > 0}
        <ListCard role={tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.liveTiles)}>
          {#each quietListTiles as tile (tile.key)}
            <ListRow
              key={tile.tileKey}
              href={tile.href}
              title={tile.title}
              subtitle={tile.note}
              {...tile.attrs}
              data-live-tile={tile.key}
            />
          {/each}
        </ListCard>
      {/if}

      {#if tileSplit.folded.length > 0}
        <button
          type="button"
          class="home-fold press"
          data-home-tiles-fold
          aria-expanded={tilesExpanded}
          onclick={() => (tilesExpanded = !tilesExpanded)}
        >
          <span class="home-fold-mark" class:is-open={tilesExpanded} aria-hidden="true">
            <Icon name="chevronDown" size={16} />
          </span>
          <span class="home-fold-text">
            {#key tilesFoldLabel}<span transition:labelFade>{tilesFoldLabel}</span>{/key}
          </span>
        </button>
      {/if}
    </div>
  {/if}

  <!-- The pinned rows (ticket 05, ADR-0073): what the person put on their
       front page, in their order, each with its reading and the day of it
       or the line about what is behind it, off the same registry and the
       same line rule as the Transition door. A pin naming a hidden area
       resolves to nothing before it gets here.

       The block is here whether or not anything is pinned, which it was not
       before ticket 14: the last row of it is the way into the edit mode,
       and an empty arrangement that drew no heading would have left
       somebody who unpinned everything with no way back. With nothing
       pinned it is the one row, and that row asks for the first pin rather
       than repeating the heading. -->
  <div data-home-pinned>
    {#if editing}
      <div transition:collapse={panel} data-home-editing>
        <TodayEditor
          {pinned}
          {reading}
          nowMs={liveTiles.nowMs}
          role={tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.pinned)}
          onDone={() => (editing = false)}
        />
      </div>
    {:else}
      <div transition:collapse={panel}>
        <SectionHeading text={m.home_pinned_heading()} />
        <ListCard role={tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.pinned)}>
          {#each pinned as row (row.spec.key)}
            <div class="rows-divide" transition:disclose={panel}>
              <ListRow
                key={row.spec.key}
                icon={row.spec.icon}
                title={hubRowTitle(row.spec.key)}
                subtitle={hubRowLine(row.spec.key, row.line, today, liveTiles.nowMs)}
                href={row.spec.href}
                data-pinned-row={row.spec.key}
                data-hub-line={row.line.kind}
              />
            </div>
          {/each}
          <!-- The way in, as the last row of the block (ticket 14). It is a
               row rather than a control on the heading because it is the
               next thing after the rows it edits, and it names the first
               pin where there are none to arrange yet. -->
          <ListRow
            key="edit-today"
            icon="pencil"
            title={pinned.length > 0 ? m.home_pinned_edit() : m.home_pinned_edit_empty()}
            chevron={false}
            onclick={() => (editing = true)}
            data-edit-today
          />
        </ListCard>
      </div>
    {/if}
  </div>

  <!-- Getting started, until the journal has five entries in it. It sits
       at the foot, under the log strip and the pinned rows: the first move
       is writing something, and this is what to do next, not what to do
       instead. With the agenda absent and no tile qualifying, it and the
       two above it are the whole of day one - no empty card, no
       placeholder grid, no skeleton (ticket 13).

       It takes the live tiles' stripe. Nothing else claims that colour
       while it is on screen - a journal this young has no tile qualifying -
       and both are the same kind of thing: somewhere on Home that asks to
       be acted on rather than read. -->
  {#if showGettingStarted}
    <!-- The handle rides the wrapper: ListCard takes a role and its children
         and nothing else, and widening a kit surface to pass one screen's
         walkthrough handle through would be the wrong file to change. -->
    <div transition:collapse={panel} data-getting-started>
      <SectionHeading text={m.home_start_title()} />
      <p class="home-start-intro">{m.home_start_intro()}</p>
      <ListCard role={tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.liveTiles)}>
        {#each GETTING_STARTED as offer (offer.key)}
          <ListRow
            key={offer.key}
            icon={offer.icon}
            href={offer.href}
            title={offer.title()}
            subtitle={offer.sub()}
          />
        {/each}
      </ListCard>
    </div>
  {/if}

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

  <Sheet
    open={letterDismissSheetOpen}
    title={m.tile_letter_dismiss_title()}
    onClose={() => (letterDismissSheetOpen = false)}
  >
    <div data-letter-dismiss-sheet>
      <SectionHeading text={m.tile_letter_dismiss_title()} />
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.tile_letter_dismiss_hint()}</p>
      <div class="stack-3">
        <button
          class="btn btn-primary btn-block"
          data-letter-snooze
          onclick={() => {
            liveTiles.snooze('ready-letter');
            letterDismissSheetOpen = false;
            toast(m.tile_letter_snoozed_toast());
          }}
        >
          <span>{m.tile_letter_snooze_btn()}</span>
        </button>
        <button
          class="btn btn-ghost btn-block"
          data-letter-dont-show
          onclick={() => {
            prefs.readyLetterEnabled = false;
            letterDismissSheetOpen = false;
          }}
        >
          <span>{m.tile_letter_dont_show_btn()}</span>
        </button>
      </div>
    </div>
  </Sheet>

  <Sheet
    open={stockDismissSheetOpen}
    title={m.notice_stock_dismiss_title()}
    onClose={() => (stockDismissSheetOpen = false)}
  >
    <div data-stock-dismiss-sheet>
      <SectionHeading text={m.notice_stock_dismiss_title()} />
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.notice_stock_dismiss_hint()}</p>
      <div class="stack-3">
        <button
          class="btn btn-primary btn-block"
          data-stock-snooze
          onclick={() => {
            snoozeStockNotice();
            isStockNoticeSnoozedState = true;
            stockDismissSheetOpen = false;
            toast(m.notice_stock_snoozed_toast());
          }}
        >
          <span>{m.notice_stock_snooze_btn()}</span>
        </button>
        <button
          class="btn btn-ghost btn-block"
          data-stock-dont-show
          onclick={() => {
            prefs.stockNoticeEnabled = false;
            stockDismissSheetOpen = false;
          }}
        >
          <span>{m.notice_stock_dont_show_btn()}</span>
        </button>
      </div>
    </div>
  </Sheet>
</div>

<style>
  /* The header is the field and its foot (phase 10, DIRECTION.md rule 7;
     redesign ticket 23). The header itself is a plain block; the field
     below it is what bleeds, clips and paints. */
  .home-header {
    position: relative;
  }
  /* The field: a solid block of the flag's second colour, published by
     activeFlag as --field with its ink beside it (--surface-2 and --text
     under disguise). Widened past .screen's own horizontal padding
     (negative margin) and padded back out to the same inset, so the flag
     sun's corner point lands exactly on the screen's true top right corner
     rather than the padded content edge - "centred exactly on the screen's
     top right corner" (DIRECTION.md) - while the wordmark keeps its usual
     alignment with everything below it. overflow: hidden clips the sun's
     bleed to a clean quarter instead of a scrollable overhang; min-height
     keeps that quarter from clipping again against the field's own bottom
     edge before the innermost ring finishes drawing (SUN_OUTER/2 in
     $lib/motion/flagSun.ts), and is the field's height: the sun's quarter
     plus the window inset, with the wordmark sitting at its foot.

     175px rather than a var(), because CSS has no way to read a TS export -
     flagSun.test.ts holds this number to SUN_OUTER/2 so the two cannot drift
     silently. What is a var() here is the scale: the breathing loop grows
     every ring to --sun-breathe-scale (theme/base.css) at its cycle's
     midpoint, and the resting radius alone was the reserve until phase 5
     ticket 32.12 - so for part of every cycle the outermost ring grew past
     its own room and overflow: hidden shaved it flat along the header's own
     bottom edge. Multiplying by the same token the breathing keyframe reads
     means the two can only ever agree.

     The one deliberate bleed past the safe area (phase 5 ticket 18). The
     scroll region pads every screen clear of the display cutout; the field
     pulls itself back up by exactly that inset, so the sun's centre lands
     on the window's true top right corner, and pads its own content back
     down by the same amount. Decoration crosses the inset; nothing readable
     does. */
  .home-field {
    position: relative; z-index: 1;
    display: flex; align-items: flex-end;
    /* The colour is the blind's, not this element's (redesign ticket 28,
       components.css); what stays here is the box that measures it. */
    color: var(--field-ink);
    padding: calc(var(--space-4) + var(--inset-top)) var(--space-5) var(--space-4);
    margin: calc(-1 * var(--inset-top)) calc(-1 * var(--space-5)) 0;
    overflow: hidden;
    /* The same bottom corners every other field has (rule 7: "the bottom
       corners are the one radius; the top corners meet the window's edge
       and have none"). Home was the one door drawing them square, which
       nothing decided - and the blind's clip carries one radius for the
       whole app, so a square corner here would round for the length of a
       navigation and snap back at the end of it. */
    border-radius: 0 0 var(--r-block) var(--r-block);
    min-height: calc(175px * var(--sun-breathe-scale) + var(--inset-top));
  }
  /* The wordmark, in the field's bottom left corner and in the field's ink,
     at the door-title voice (rule 2): Outfit 800, set solid, fluid between
     1.7rem and the 48px a door's title takes. Flat: colour arrives as fill
     and as text, never as a gradient (DIRECTION.md decision 2), and the
     gradient this once was ran "Diary" through olive on nonbinary.

     Under the sun's reach, by arithmetic rather than a width cap. The sun is
     a 350px disc centred on the field's top right corner, breathing to 1.035,
     and the field is exactly its radius tall - so at the field's bottom edge
     the disc has no width at all, and a line of type sitting on that edge
     meets the disc only as high as its own cap height. At 48px the wordmark
     is 46px tall and its top is 64px from the bottom edge (16 of padding),
     which is 117px below the corner; the disc's chord there is
     sqrt(181^2 - 117^2) = 138px, so the word may run to 138px short of the
     right edge. "enGender" at 48px is 242px wide (5.05px per font px), and
     at 390px there are 252. Below 360px the sun draws at 0.82 (a 148px
     radius, a 92px chord at that height, 228px of room for a 210px word at
     320), and below 240px at 0.6, where the word at its 1.7rem floor sits
     wholly under the disc. Polish takes the same word. */
  .home-hero {
    font-family: var(--font-display);
    font-size: clamp(1.7rem, 13cqw, 3rem);
    font-weight: var(--weight-display);
    line-height: 0.95;
    letter-spacing: -0.045em;
    color: inherit;
    margin: 0;
    min-width: 0;
  }
  /* Below 360px the sun draws at 0.82, below 240px (what 200% zoom leaves of
     a 390px phone) at 0.6 (rule 7). The field keeps its height in both, so
     the wordmark's place does not move; only the disc shrinks toward its
     corner. The old header reserved room for the full-size sun beside the
     hello line and collapsed that line to zero width at 195px; the foot
     below has no sun beside it and needs no reservation. */
  @container app (max-width: 359px) {
    .home-field { --sun-scale: 0.82; }
  }
  @container app (max-width: 239px) {
    .home-field { --sun-scale: 0.6; }
  }
  /* The foot: two lines of secondary text at 15/600 (rule 2) and the gear at
     the end of the first, on the page. 12 under the field, and the gear's
     48px box is pulled up and out by the 13px its 22px glyph sits inside,
     so the glyph aligns with the content edge and the hello line's own
     first line rather than floating in the middle of the foot. */
  .home-foot {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: var(--space-3);
    padding-top: var(--space-3);
  }
  .home-foot-lines { flex: 1; min-width: 0; }
  .home-hello,
  .home-count {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    margin: 0;
  }
  .home-hello { color: var(--text); }
  /* The count line takes the greeting's own size and weight rather than a
     step of its own, one shade quieter: the foot reads as today, then
     history, and neither is a score. Tabular numerals so the figure does not
     shift width as it grows. */
  .home-count {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    /* Balanced, so a wrapping line breaks after "since" rather than
       stranding the year on a line of its own. Ignored where it is not
       supported, which leaves the ordinary wrap. */
    text-wrap: balance;
  }
  .home-gear {
    flex: none;
    color: var(--text-2);
    margin: calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) 0 0;
  }
  /* On the web the field is a banner across the column with the one radius
     on all four corners (rule 7); the outline frame Home drew around itself
     on the web retires with it (screens.css), since the field is the
     column's top edge now. */
  @container app (min-width: 1024px) {
    .home-field { border-radius: var(--r-block); }
  }
  /* Home ran a rhythm of its own here until this ticket - 12 between
     blocks where every other screen has 20, and a heading with its padding
     zeroed so its words sat on its rule. Both predate DIRECTION.md's rule 1
     and both are gone: the screen takes `.screen > *` and `.kit-heading`
     as written, the same three distances as every other door. */

  /* The authored moment: on a milestone day, arriving on Home throws a
     little confetti over the notice naming it, once.

     It plays and stops. DIRECTION.md's tier 4 rules out a second ambient
     *loop*, which is why the celebration card's infinite `cf-fall` was
     deleted rather than moved here; a moment with an end is the same
     category as the sun's entrance, and it spends the authored duration
     twice over.

     Out of the flow, so the band's own height is never a permanent gap on
     the days it does not fire - a moment cannot be allowed to decide the
     resting layout.

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

  /* Substituted rather than clamped: at 1ms this is a flicker, and the
     notice underneath already names the milestone it stands for. */
  :global(html[data-a11y-motion='reduce']) .home-cheer i { animation: none; }
  @media (prefers-reduced-motion: reduce) {
    .home-cheer i { animation: none; }
  }

  /* The three weights, as three blocks of one area. They share the section's
     stripe, so what separates them is the seam between an opaque surface and
     the page rather than a shadow or a second colour - box-shadow is banned
     in the kit and tested for.

     Tighter between the blocks than Home's own rhythm between sections
     (--space-2 against --space-3): three weights of one thing sit closer
     together than two different things do. */
  .home-tiles {
    display: grid;
    gap: var(--space-2);
  }

  /* The fold. A row rather than a link, because it discloses in place and
     goes nowhere - ADR-0039's amendment is that overflow folds and never
     becomes a route, and a chevron pointing right would promise the
     opposite. It names what it holds so you can tell whether to open it.

     Full width and 44px tall: it is the control for everything the cap left
     out, and the touch floor applies to it like any other row. */
  .home-fold {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--text-2);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }

  .home-fold:hover,
  .home-fold:active {
    color: var(--text);
    border-color: var(--outline);
  }

  /* Tier 3, change within a screen: the mark turns to point at what it has
     opened. Substituted rather than clamped under reduced motion - the
     rotation is the state, so what it substitutes to is the rotated mark
     arriving at once rather than no rotation at all. */
  .home-fold-mark {
    display: inline-flex;
    transition: transform var(--dur-med) var(--ease-out);
  }

  .home-fold-mark.is-open {
    transform: rotate(180deg);
  }

  :global(html[data-a11y-motion='reduce']) .home-fold-mark { transition: none; }
  @media (prefers-reduced-motion: reduce) {
    .home-fold-mark { transition: none; }
  }

  /* A grid of one cell, so the outgoing and incoming labels stand on the
     same spot while they cross and the button keeps its width. */
  .home-fold-text {
    display: grid;
    min-width: 0;
  }
  .home-fold-text > span {
    grid-area: 1 / 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The line under the Getting started heading, at the secondary size and
     weight (rule 2). */
  .home-start-intro {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  /* The agenda's day block: 44 wide so a two-digit day at display weight
     has its own room, 48 tall to the row's floor. Small text on a fill,
     which palette-contrast.test.ts holds to 4.5:1 for every stripe of every
     flag under --role-fill-ink (the day bar's own case). The list is one
     block of the screen; the fold under it is that block's last row and
     sits 12 under the card rather than a full block away. */
  .home-agenda {
    display: grid;
    gap: var(--space-3);
  }
  .home-agenda-day {
    flex: 0 0 auto;
    width: 44px;
    height: var(--touch-target);
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 1px;
    background: var(--role-draw);
    color: var(--role-fill-ink);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    line-height: 1;
    /* A block arrives by clipping open from its left edge (rule 10): the
       kit's own keyframes, at this block's size, one --stagger-step per
       row of the arrival (--row-index, set by the list). The words beside
       it cut, as words do. Filled both ways so the 1ms clamp ends it where
       it rests; the -6px outset is the focus ring's, as on every block. */
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--row-index, 0) * var(--stagger-step));
  }
  .home-agenda-wd {
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: 0.02em;
  }
  .home-agenda-dn {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    font-variant-numeric: tabular-nums;
  }
  /* A slot that went by: the page's own ground with the block's edge and
     the text's ink, so it reads as the outline of a day rather than a day
     coming. */
  .home-agenda-day.is-passed {
    background: var(--bg);
    color: var(--text-2);
  }

  /* The log strip: the mood row's own hairlines above and below it, then
     the four shapes under a hairline of their own, so the whole strip is
     one flush surface between two lines with one line through it (rule 4).
     The row is a grid that packs as many shapes as fit at 64px and no
     fewer than two, so at 320px the four sit in a row, and at 195px - 200%
     zoom on a 390px phone - they go two by two rather than shrinking their
     targets. */
  .home-log {
    display: grid;
  }
  .home-log > :global(.kit-moods) {
    border-bottom: 0;
  }
  .home-log-shapes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
    gap: var(--space-2);
    padding: var(--space-3) 0;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }
  /* A shape is a column - the square, then its words - and the whole
     column is the target, which clears the floor by the square alone. The
     words sit on the page at the caption size in the secondary ink, the
     way the faces' names do beside them. Two lines are reserved for them
     whether a label needs one or two, so "Correctly gendered" wrapping does
     not leave the other three squares standing on a shorter column. */
  .home-log-shape {
    display: grid;
    grid-template-rows: auto 2.4em;
    justify-items: center;
    align-content: start;
    gap: var(--space-2);
    min-width: 0;
    min-height: var(--touch-target);
    padding: var(--space-1) 0;
    border: 0;
    background: none;
    color: var(--text-2);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    line-height: 1.2;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }
  /* The square: a block of the strip's stripe with the glyph in the ink
     proven on it, the row icon's own recipe at the touch floor's size. It
     clips: the faces that pass through it ($lib/motion/drum) are covered
     by its own edges, which is what makes the drum a drum. */
  .home-log-ico {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--touch-target);
    height: var(--touch-target);
    overflow: hidden;
    background: var(--role-draw);
    color: var(--role-fill-ink);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
  }
  /* A face fills the square, so the outgoing and the incoming stand on the
     same spot while one leaves and the other arrives. */
  .home-log-face {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  /* The count, at the size a number on a block is written (rule 2): large
     text, so every stripe carries it at 3:1. */
  .home-log-count {
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  /* The wear label's two words stand on one cell while they cross, the
     fold label's own trick, so the column keeps its width. */
  .home-log-label-cross {
    display: grid;
    justify-items: center;
  }
  .home-log-label-cross > span {
    grid-area: 1 / 1;
  }
  /* Hyphenated at 320px rather than cut mid-word: "Misgendered" is wider
     than a 64px column, and a break with no hyphen read as two words. */
  .home-log-label {
    max-width: 100%;
    hyphens: auto;
    overflow-wrap: anywhere;
  }
</style>
