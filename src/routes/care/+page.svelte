<script lang="ts">
  /* THESIS: the care readings are positions on one line, not four figures in
     four boxes; it refuses the grouping screen that is only a menu.
     OWN-WORLD: the app's own kit and flag palettes - ChartCard, ListCard,
     ListRow, role 0's stripe on the rail, Nunito body and Outfit display, a
     hairline rather than elevation.
     STORY: you see where you are between doses, when blood was last taken
     and how long the box lasts, then tap through to whichever of those you
     came for.
     FIRST VIEWPORT: the regimen named at the top, then a full-width rail
     with today's tick fixed in it, the last dose behind, the next dose and
     the run-out day ahead, the draw marked where it fell; the readings that
     do not fit a rail follow as rows under one heading.
     FORM: the spine, first of seven on my own order and dealt by an external
     roll (the shipped concept-seed script returned nothing on this machine,
     so /dev/urandom rolled it; seed order 7 5 1, locked from the served
     decision page).
     FINISH: unreviewed and undocumented is unfinished; this build ends with
     the finish review, the verdict, DESIGN.md, and every shipping raster
     carrying its provenance.

     The care overview (phase 5 deepening ticket 07, ADR-0036: a feature
     surface, so it lives in the More hub rather than under /settings).

     What this screen does NOT do is the point of it. The ticket it comes
     from used to ask for an interactive care canvas - a pharmacokinetic
     curve, computed draw context, an exposure counter, a stock horizon -
     and every one of those had already shipped: /settings/hormone-curve,
     labTiming.ts, journal/exposure.ts, stockProjection.ts. So there is no
     modelling here and no second calculation of anything. Every figure on
     this screen is a live read of a module that already owned it, and the
     only arithmetic in the diff is careSpine.ts working out where five days
     sit on one line.

     Nothing here judges. The rail says when things happened and when the
     schedule expects the next one; no mark is late, no interval is the right
     one, and no lab value is read as anything (PRODUCT.md:109, and
     labTiming.ts and /settings/hormone-curve as the worked precedents). */
  import { m } from '$lib/paraglide/messages';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { careSpine, lastLoggedDoseDay, nextExpectedSlot, SPINE_FORWARD_DAYS, type SpineMark, type SpineMarkKind } from '$lib/data/careSpine';
  import { epochDayFromTimestamp, todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { attributeDose } from '$lib/data/regimenEpisode';
  import { depletingStocks } from '$lib/data/stockProjection';
  import { stockRemainingLabel } from '$lib/data/vocabulary/stockLabel';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Two areas: the rail, and the readings that do not fit on one. The rail
     takes role 0, the only index that is a colour on all eight palettes
     (roles.ts) - it is the one place on this screen where the stripe is
     carrying meaning rather than decorating a card. */
  const AREA_ROLE = { rail: 0, readings: 1 };

  const today = todayEpochDay();
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });

  /* The whole dose log rather than a window, the way /doses reads it for
     rotation-site recency: "the last dose" has to mean the last one, and a
     window would report none for anyone who paused for longer than it.
     careSpine clamps a dose older than the rail's reach to its left end and
     flags it, so an old dose reads as old rather than as absent. */
  let dosesQuery = liveList((j) => j.doses.getDoses(0, today));
  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  /* Which episode is in effect, its schedule and its pauses, assembled by
     the same call the dose log makes (journal/doses.ts) rather than by six
     reads here. Its window ends today because that is the day the episode
     question is being asked about. */
  let comparisonQuery = liveQuery((j) => j.doses.getComparison({ fromEpochDay: today - 1, toEpochDay: today }));
  let stockQuery = liveList((j) => j.stock.getProjections(today));
  let latestLabQuery = liveQuery((j) => j.labs.getLatestResult());

  let comparison = $derived(comparisonQuery.value ?? null);
  let activeEpisode = $derived(comparison && 'activeEpisode' in comparison ? comparison.activeEpisode : null);
  let severalRegimens = $derived(comparison?.reason === 'multipleEpisodes');
  let latestLab = $derived(latestLabQuery.value ?? null);

  /* The soonest run-out inside the rail's forward reach, through the helper
     Home's stock notice uses - passed the rail's own horizon instead of the
     notice threshold, so this asks "is there a run-out on this line" rather
     than "is one close". A run-out further out than the rail simply has no
     mark: the stock row below still states what is left. */
  let runOut = $derived(depletingStocks(stockQuery.rows, today, SPINE_FORWARD_DAYS)[0] ?? null);

  /* Only the doses this episode is responsible for, attributed the way every
     other screen attributes them, and only from today on: the slots the next
     one is picked from start today, so nothing earlier can fill one. */
  let episodeDosesFromToday = $derived(
    activeEpisode
      ? dosesQuery.rows.filter(
          (dose) =>
            epochDayFromTimestamp(dose.timestamp) >= today &&
            attributeDose(episodesQuery.rows, dose).episode?.id === activeEpisode.id
        )
      : []
  );

  let nextSlot = $derived(
    comparison && comparison.reason === null
      ? nextExpectedSlot(comparison.schedule, comparison.activeEpisode.startEpochDay, episodeDosesFromToday, comparison.pauses, today)
      : null
  );

  let spine = $derived(
    careSpine(
      {
        lastDoseEpochDay: lastLoggedDoseDay(dosesQuery.rows),
        nextDoseEpochDay: nextSlot?.epochDay ?? null,
        labDrawEpochDay: latestLab?.epochDay ?? null,
        runOutEpochDay: runOut?.projection.runOutEpochDay ?? null
      },
      today
    )
  );

  const MARK_LABEL: Record<SpineMarkKind, () => string> = {
    labDraw: () => m.care_mark_lab_draw(),
    lastDose: () => m.care_mark_last_dose(),
    today: () => m.care_mark_today(),
    nextDose: () => m.care_mark_next_dose(),
    runOut: () => m.care_mark_run_out()
  };

  /* Where a mark goes when it is tapped: the surface the reading came from,
     which is the whole of what makes the rail worth a tap. Today is the one
     mark that is not a link - it is where the reader is, not somewhere to
     go - and it renders as plain text rather than as a link that does
     nothing. */
  const MARK_HREF: Record<SpineMarkKind, string | null> = {
    labDraw: '/settings/labs',
    lastDose: '/doses',
    today: null,
    nextDose: '/doses',
    runOut: '/settings/stock'
  };

  const markAria = (mark: SpineMark): string =>
    mark.beyondSpan
      ? m.care_mark_off_rail_aria({ what: MARK_LABEL[mark.kind](), when: dayLabel(mark.epochDay) })
      : m.care_mark_aria({ what: MARK_LABEL[mark.kind](), when: dayLabel(mark.epochDay) });

/* Lanes alternate sides: lane 0 hangs below the line, lane 1 stands above
   it, lane 2 is a second row below, and so on. Parity rather than a run down
   one side, because a rail is read across and two rows on one side push the
   line off centre for the sake of one crowded pair. */
  const laneSide = (lane: number) => (lane % 2 === 0 ? 'below' : 'above');
  const laneDepth = (lane: number) => Math.floor(lane / 2);

  /* Only as tall as the arrangement needs: the rows in use on each side of
     the line, never a reserved lane nothing is in. A fixed height left the
     top half of the card empty whenever the marks were spread out, which
     read as a chart that had failed to draw. */
  let rowsBelow = $derived(Math.max(...(spine?.marks ?? []).filter((mark) => laneSide(mark.lane) === 'below').map((mark) => laneDepth(mark.lane) + 1), 1));
  let rowsAbove = $derived(Math.max(...(spine?.marks ?? []).filter((mark) => laneSide(mark.lane) === 'above').map((mark) => laneDepth(mark.lane) + 1), 0));
</script>

<div class="screen">
  <ScreenHeader title={m.care_title()} back="/more" screen="care" />

  {#if spine}
    {#if activeEpisode}
      <a class="care-regimen" href="/settings/regimen" data-care-regimen>
        <span class="care-regimen-lines">
          <span class="care-regimen-drug">{activeEpisode.drug}</span>
          <span class="care-regimen-detail"
            >{m.care_regimen_sub({
              dose: String(activeEpisode.dose),
              unit: activeEpisode.doseUnit,
              interval: activeEpisode.interval
            })}</span
          >
        </span>
        <Icon name="chevronRight" size={22} cls="care-regimen-go" />
      </a>
    {:else if severalRegimens}
      <!-- No single regimen to name, so nothing is named. This is a note
           about why the rail has no next-dose mark, at the size a note is:
           the display line above belongs to a drug's name, and a sentence
           set in it reads as the screen shouting. -->
      <a class="care-regimen" href="/settings/regimen" data-care-regimen>
        <span class="care-regimen-lines">
          <span class="care-regimen-detail">{m.care_regimen_several()}</span>
        </span>
        <Icon name="chevronRight" size={22} cls="care-regimen-go" />
      </a>
    {/if}

    <ChartCard heading={m.care_rail_heading()} kind="care-spine" role={roleAt(activeFlag.roles, AREA_ROLE.rail)}>
      <div class="care-rail" style="--care-rows-below: {rowsBelow}; --care-rows-above: {rowsAbove}" data-care-rail>
        <div class="care-track">
          <span class="care-line care-line-back" aria-hidden="true"></span>
          <span class="care-line care-line-on" aria-hidden="true"></span>
          {#each spine.marks as mark (mark.kind)}
            {@const style = `--care-at: ${mark.position}; --care-depth: ${laneDepth(mark.lane)}; --care-settle: ${Math.abs(mark.position - 0.5).toFixed(3)}`}
            {#if MARK_HREF[mark.kind]}
              <a
                class="care-mark"
                data-care-mark={mark.kind}
                data-side={laneSide(mark.lane)}
                class:is-beyond={mark.beyondSpan}
                {style}
                href={MARK_HREF[mark.kind]}
                aria-label={markAria(mark)}
              >
                <span class="care-tick" aria-hidden="true"></span>
                <span class="care-caption">
                  <span class="care-what">{MARK_LABEL[mark.kind]()}</span>
                  <span class="care-when">{dayLabel(mark.epochDay)}</span>
                </span>
              </a>
            {:else}
              <span class="care-mark is-today" data-care-mark={mark.kind} data-side={laneSide(mark.lane)} {style}>
                <span class="care-tick" aria-hidden="true"></span>
                <span class="care-caption">
                  <span class="care-what">{MARK_LABEL[mark.kind]()}</span>
                  <span class="care-when">{dayLabel(mark.epochDay)}</span>
                </span>
              </span>
            {/if}
          {/each}
        </div>
      </div>
    </ChartCard>
  {:else}
    <Notice icon="info" key="care-empty" text={m.care_rail_empty()} />
  {/if}

  <SectionHeading text={m.care_group_hormones()} />
  <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.readings)}>
    <!-- The row keeps its own name and earns a subtitle by stating the
         reading under it (DIRECTION.md 3b): the analyte and the result in
         its own unit, never converted (ADR-0026). The rail above carries
         the day it was drawn, and where that draw fell against dosing stays
         on /settings/labs, which owns it. -->
    <ListRow
      key="labs"
      icon="flask"
      title={m.lab_results()}
      subtitle={latestLab && `${latestLab.analyte} ${latestLab.value} ${latestLab.unit}`.trim()}
      href="/settings/labs"
    />
    <ListRow key="hormone-curve" icon="curve" title={m.curve_title()} href="/settings/hormone-curve" />
    <ListRow key="doses" icon="clock" title={m.doses()} href="/doses" />
    <ListRow key="exposure" icon="stats" title={m.regimen_exposure_link()} href="/settings/exposure" />
    <!-- The rail marks the run-out day; what it cannot show is how much is
         left, so the row carries that half through stockLabel.ts, the same
         wording /settings/stock, /doses and the quick-log chip all use. -->
    <ListRow
      key="stock"
      icon="package"
      title={m.regimen_stock_link()}
      subtitle={runOut && stockRemainingLabel(runOut.projection.remaining, runOut.entry.unit)}
      href="/settings/stock"
    />
  </ListCard>
</div>

<style>
  /* The regimen, named above the rail: what the line is a line about. Not a
     ListRow in a card of its own - that is a third stacked container on a
     390px screen for one fact, and DIRECTION.md 2b is about exactly that -
     but it keeps a row's touch target and a row's press. */
  .care-regimen {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--touch-target);
    padding: var(--space-2) 0;
    margin-bottom: var(--space-3);
    text-decoration: none;
    color: inherit;
  }
  .care-regimen-lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  /* The same chevron a ListRow ends with, at the same size: this is not a
     row in a card, but it is a destination, and a destination that looks
     like a heading is a heading. */
  .care-regimen :global(.care-regimen-go) {
    flex: 0 0 auto;
    color: var(--text-2);
  }

  .care-regimen-drug {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }
  .care-regimen-detail {
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .care-rail {
    /* As tall as the rows in use, and the line sits between the rows above it
       and the rows below: with nothing above, a line near the top with its
       captions under it; with one row above, a line through the middle. Both
       counts come from the marks themselves rather than from a breakpoint. */
    --care-lane-h: 52px;
    --care-line-y: calc(var(--care-rows-above) * var(--care-lane-h) + 1px);
    height: calc((var(--care-rows-above) + var(--care-rows-below)) * var(--care-lane-h) + 2px);
    /* A rail with nothing above the line otherwise starts against the card's
       heading, which reads as the heading underlined. */
    padding-top: var(--space-2);
    display: flex;
    align-items: stretch;
  }
  /* The marks position inside the track, not the rail, so a caption centred
     on a mark at either end overflows into the rail's own margin instead of
     out of the card. */
  .care-track {
    position: relative;
    flex: 1;
    margin-inline: var(--space-6);
    height: 100%;
  }

  .care-line {
    position: absolute;
    top: var(--care-line-y);
    height: 2px;
    border-radius: 1px;
    transform: translateY(-50%);
  }
  /* Two lines, not one: the rail is read out from today in both directions,
     so it is drawn that way. The back line is the rail's full width in the
     role's own tint; the front line grows out from today's tick over
     --dur-authored, which is the duration the area chart's first draw
     settled on for the same kind of moment (motion/reveal.ts). Reduced
     motion needs no branch here: base.css clamps every --dur-* token to
     1ms, so the growth lands instantly and the rail is simply there. */
  .care-line-back {
    left: 0;
    right: 0;
    background: color-mix(in oklab, var(--role-mark) 22%, transparent);
  }
  .care-line-on {
    left: 50%;
    right: 50%;
    background: var(--role-mark);
    animation: care-line-grow var(--dur-authored) var(--ease-out) forwards;
  }
  @keyframes care-line-grow {
    to {
      left: 0;
      right: 0;
    }
  }

  .care-mark {
    position: absolute;
    left: calc(var(--care-at) * 100%);
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    /* The caption is around 48px wide and the tick is 2px, so the target is
       the mark's own box: it stays at the floor whatever the tick looks
       like. */
    min-width: var(--touch-target);
    text-decoration: none;
    color: inherit;
    /* Settles as the line reaches it: a mark a third of the way out waits a
       third of the growth. Delay off --dur-med rather than a literal, so
       reduced motion collapses it with everything else. */
    opacity: 0;
    animation: care-mark-settle var(--dur-med) var(--ease-out) forwards;
    animation-delay: calc(var(--care-settle) * var(--dur-authored));
  }
  @keyframes care-mark-settle {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  /* Lane 0 hangs below the line, lane 1 stands above it: two labels that
     would print over each other take opposite sides of the rail rather than
     a second row on the same side, which is what keeps the card at one
     height whatever the arrangement (careSpine.ts assigns them). */
  .care-mark[data-side='below'] {
    top: calc(var(--care-line-y) + var(--care-depth) * var(--care-lane-h));
    padding-top: var(--space-4);
    justify-content: flex-start;
  }
  .care-mark[data-side='above'] {
    bottom: calc(100% - var(--care-line-y) + var(--care-depth) * var(--care-lane-h));
    padding-bottom: var(--space-4);
    justify-content: flex-end;
    flex-direction: column-reverse;
  }

  /* The tick is also the stem: a caption pushed to a second row reaches back
     to the line rather than floating beside it, so a crowded pair still reads
     as two marks on one rail. */
  .care-tick {
    position: absolute;
    width: 2px;
    height: calc(var(--space-4) + var(--care-depth) * var(--care-lane-h));
    background: var(--role-mark);
    border-radius: 1px;
  }
  .care-mark[data-side='below'] .care-tick {
    top: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  .care-mark[data-side='above'] .care-tick {
    bottom: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  /* Today is a disc on the line rather than a tick off it: it is the one
     mark that is a place rather than an event, and it is what the rail is
     measured from. */
  .care-mark.is-today .care-tick {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--surface);
  }
  /* A today pushed to a second row keeps a stem to the line under its disc,
     the way every other deep mark does. */
  .care-mark.is-today[data-side='below'] .care-caption::before,
  .care-mark.is-today[data-side='above'] .care-caption::before {
    content: '';
    position: absolute;
    width: 2px;
    height: calc(var(--care-depth) * var(--care-lane-h));
    background: var(--role-mark);
  }
  .care-mark.is-today[data-side='below'] .care-caption::before {
    top: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  .care-mark.is-today[data-side='above'] .care-caption::before {
    bottom: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  .care-mark.is-today[data-side='below'] .care-tick {
    top: calc(-6px - var(--care-depth) * var(--care-lane-h));
  }
  .care-mark.is-today[data-side='above'] .care-tick {
    bottom: calc(-6px - var(--care-depth) * var(--care-lane-h));
  }

  .care-caption {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.2;
  }
  .care-what {
    font-size: var(--text-xs);
    color: var(--text-2);
    white-space: nowrap;
  }
  .care-when {
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    color: var(--role-ink);
    white-space: nowrap;
  }
  .care-mark.is-today .care-what {
    color: var(--role-ink);
    font-weight: var(--weight-bold);
  }
  /* A day the rail could not reach, drawn at the end it was pulled in to.
     The caption still says the real date; the dotted tick is what says the
     mark is not where the day is. */
  .care-mark.is-beyond .care-tick {
    background: repeating-linear-gradient(
      to bottom,
      var(--role-mark) 0 2px,
      transparent 2px 4px
    );
  }
</style>
