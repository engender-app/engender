<script lang="ts">
  /* The care overview (phase 5 deepening ticket 07, ADR-0036: a feature
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
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import {
    careSpine,
    chooseRailEpisode,
    scheduleDoseFacts,
    SPINE_FORWARD_DAYS,
    type SpineMark,
    type SpineMarkKind
  } from '$lib/data/careSpine';
  import { startOfDayTimestamp, todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import type { RegimenEpisode } from '$lib/data/types';
  import { depletingStocks } from '$lib/data/stockProjection';
  import { stockRemainingLabel } from '$lib/data/vocabulary/stockLabel';
  import { crossfade } from '$lib/motion/reveal';
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
  /* Every episode's own schedule and pauses, read whole (doses.ts: both are
     small, one row per episode) rather than through getComparison, which
     answers "the sole active episode" and gives up the moment a second one
     is active - the exact case this screen now has to draw (ticket 38). */
  let schedulesQuery = liveList((j) => j.doses.getSchedules());
  let pausesQuery = liveList((j) => j.doses.getPauses());
  let stockQuery = liveList((j) => j.stock.getProjections(today));
  let latestLabQuery = liveQuery((j) => j.labs.getLatestResult());

  /* Every one of those six reads has to have answered before the rail means
     anything: a spine drawn while the stock query is still out would settle
     without its run-out mark and then jump. The rail is one object rather
     than a list, so this is a Skeleton against a `.loading` of its own rather
     than a ReadGate (tests/feature-screens.test.ts holds the choice between
     the two). */
  let loading = $derived(
    dosesQuery.loading ||
      episodesQuery.loading ||
      schedulesQuery.loading ||
      pausesQuery.loading ||
      stockQuery.loading ||
      latestLabQuery.loading
  );

  /* Which episodes are running today, and which of them draws the rail
     (careSpine.ts: at most one active episode of any drug is unambiguous;
     several active picks the curve drug among them, or draws nothing when
     that too is ambiguous). Renamed nowhere below: `activeEpisode` and
     `severalRegimens` are still exactly what the header block reads. */
  let activeEpisodes = $derived(activeEpisodesAt(episodesQuery.rows, startOfDayTimestamp(today)));
  let railChoice = $derived(chooseRailEpisode(activeEpisodes));
  let activeEpisode = $derived(railChoice.rail);
  let severalRegimens = $derived(railChoice.ambiguous);
  let otherActiveEpisodes = $derived(railChoice.others);
  let latestLab = $derived(latestLabQuery.value ?? null);

  /* The soonest run-out inside the rail's forward reach, through the helper
     Home's stock notice uses - passed the rail's own horizon instead of the
     notice threshold, so this asks "is there a run-out on this line" rather
     than "is one close". A run-out further out than the rail simply has no
     mark: the stock row below still states what is left. */
  let runOut = $derived(depletingStocks(stockQuery.rows, today, SPINE_FORWARD_DAYS)[0] ?? null);

  const scheduleForEpisode = (episode: RegimenEpisode) =>
    schedulesQuery.rows.find((schedule) => schedule.episodeId === episode.id) ?? null;
  const pausesForEpisode = (episode: RegimenEpisode) =>
    pausesQuery.rows.filter((pause) => pause.episodeId === episode.id);
  const doseFactsFor = (episode: RegimenEpisode) =>
    scheduleDoseFacts(episode, episodesQuery.rows, scheduleForEpisode(episode), dosesQuery.rows, pausesForEpisode(episode), today);

  let railDoseFacts = $derived(
    activeEpisode ? doseFactsFor(activeEpisode) : { lastDoseEpochDay: null, nextDoseEpochDay: null }
  );

  /* Every other active episode's own last and next dose, for the row each
     gets beneath the rail rather than a shared mark folded into it
     (ticket 38's chosen shape - the curve schedule keeps the rail exactly
     as it read before, and everything else reads underneath). */
  let otherScheduleRows = $derived(
    otherActiveEpisodes.map((episode) => ({ episode, ...doseFactsFor(episode) }))
  );

  let spine = $derived(
    careSpine(
      {
        lastDoseEpochDay: railDoseFacts.lastDoseEpochDay,
        nextDoseEpochDay: railDoseFacts.nextDoseEpochDay,
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

  <!-- Outside the rail's branch on purpose. The regimen is a reading in its
       own right, and it is the one reading that is not a day: careSpine has
       nothing to draw for it, so a journal with a regimen and no dose, draw
       or stock count yet gets no rail - and while this block sat inside that
       branch the screen answered "nothing to put on the line" without ever
       naming the regimen that was running. -->
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
    <!-- No single regimen to name, so nothing is named. This is a note about
         why the rail has no next-dose mark, at the size a note is: the
         display line above belongs to a drug's name, and a sentence set in
         it reads as the screen shouting. -->
    <a class="care-regimen" href="/settings/regimen" data-care-regimen>
      <span class="care-regimen-lines">
        <span class="care-regimen-detail">{m.care_regimen_several()}</span>
      </span>
      <Icon name="chevronRight" size={22} cls="care-regimen-go" />
    </a>
  {/if}

  {#if loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if spine}
    <ChartCard heading={m.care_rail_heading()} kind="care-spine" role={roleAt(activeFlag.roles, AREA_ROLE.rail)}>
      <div class="care-rail" style="--care-rows-below: {rowsBelow}; --care-rows-above: {rowsAbove}" data-care-rail>
        <div class="care-track">
          <span class="care-line care-line-back" aria-hidden="true"></span>
          <span class="care-line care-line-on" aria-hidden="true"></span>
          <!-- Two elements per mark, and the split is load-bearing. Placement
               along the rail is a translate, and press.css holds the app's
               press at zero specificity through :where(), so a transform of
               its own on the link would outrank :active and make every mark
               on the rail unpressable. The wrapper is placed and the link
               inside it is left free to press. The tick sits on the wrapper
               too, so it stays put against the line while the caption
               presses. -->
          {#each spine.marks as mark (mark.kind)}
            <div
              class="care-at"
              data-side={laneSide(mark.lane)}
              class:is-today={mark.kind === 'today'}
              class:is-beyond={mark.beyondSpan}
              style={`--care-at: ${mark.position}; --care-depth: ${laneDepth(mark.lane)}; --care-settle: ${Math.abs(mark.position - 0.5).toFixed(3)}`}
            >
              <span class="care-tick" aria-hidden="true"></span>
              {#if MARK_HREF[mark.kind]}
                <a class="care-mark" data-care-mark={mark.kind} href={MARK_HREF[mark.kind]} aria-label={markAria(mark)}>
                  <span class="care-what">{MARK_LABEL[mark.kind]()}</span>
                  <span class="care-when">{dayLabel(mark.epochDay)}</span>
                </a>
              {:else}
                <!-- Today is where the reader is rather than somewhere to go,
                     so it is text and not a link that leads nowhere. -->
                <span class="care-mark" data-care-mark={mark.kind}>
                  <span class="care-what">{MARK_LABEL[mark.kind]()}</span>
                  <span class="care-when">{dayLabel(mark.epochDay)}</span>
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </ChartCard>
  {:else}
    <Notice icon="info" key="care-empty" text={m.care_rail_empty()} />
  {/if}

  {#if !loading && otherScheduleRows.length > 0}
    <!-- The rail draws one schedule; every other active one - an unrelated
         daily drug alongside a hormone regimen, say - gets its own row here
         instead of a second, unlabelled mark of the same kind on the line
         (ticket 38). -->
    <SectionHeading text={m.care_group_other_regimens()} />
    <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.readings)}>
      {#each otherScheduleRows as row (row.episode.id)}
        <ListRow
          key={`other-regimen-${row.episode.id}`}
          icon="clock"
          title={row.episode.drug}
          subtitle={[
            row.lastDoseEpochDay !== null && m.care_other_last_dose({ when: dayLabel(row.lastDoseEpochDay) }),
            row.nextDoseEpochDay !== null && m.care_other_next_dose({ when: dayLabel(row.nextDoseEpochDay) })
          ]}
          href="/doses"
        />
      {/each}
    </ListCard>
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
  /* Grown by transform rather than by animating left and right.
     materials.css caps the motion palette at transform and opacity plus
     three named materials, and a 700ms animation on two inset properties is
     700ms of relayout on the mid-range Android WebView that cap exists for.
     scaleX off a centred origin is the same movement and composites. */
  .care-line-on {
    left: 0;
    right: 0;
    background: var(--role-mark);
    transform: translateY(-50%) scaleX(0);
    transform-origin: 50% 50%;
    animation: care-line-grow var(--dur-authored) var(--ease-out) forwards;
  }
  @keyframes care-line-grow {
    to {
      transform: translateY(-50%) scaleX(1);
    }
  }

  /* The wrapper is what gets placed and animated, so the link inside it
     keeps the app's press (press.css). */
  .care-at {
    position: absolute;
    left: calc(var(--care-at) * 100%);
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    /* The caption is around 48px wide and the tick is 2px, so the target is
       the caption's own box: it stays at the floor whatever the tick looks
       like. */
    min-width: var(--touch-target);
    /* Settles as the line reaches it: a mark a third of the way out waits a
       third of the growth. The delay is a multiple of a duration token
       rather than a literal, so reduced motion collapses it along with
       everything else - base.css clamps every --dur-* to 1ms. */
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
  .care-mark {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.2;
    min-width: 100%;
    text-decoration: none;
    color: inherit;
  }
  /* Lane 0 hangs below the line, lane 1 stands above it: two labels that
     would print over each other take opposite sides of the rail rather than
     a second row on the same side, which is what keeps the card at one
     height whatever the arrangement (careSpine.ts assigns them). */
  .care-at[data-side='below'] {
    top: calc(var(--care-line-y) + var(--care-depth) * var(--care-lane-h));
    padding-top: var(--space-4);
  }
  .care-at[data-side='above'] {
    bottom: calc(100% - var(--care-line-y) + var(--care-depth) * var(--care-lane-h));
    padding-bottom: var(--space-4);
    /* Only the wrapper reverses, which puts the tick under the caption
       rather than over it. The caption itself reads label then date on both
       sides of the line; reversing it too flipped "Today / 31 Aug" into "31
       Aug / Today". */
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
  .care-at[data-side='below'] .care-tick {
    top: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  .care-at[data-side='above'] .care-tick {
    bottom: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  /* Today is a disc on the line rather than a tick off it: it is the one
     mark that is a place rather than an event, and it is what the rail is
     measured from. */
  .care-at.is-today .care-tick {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--surface);
  }
  /* A today pushed to a second row keeps a stem to the line under its disc,
     the way every other deep mark does. */
  .care-at.is-today::before {
    content: '';
    position: absolute;
    width: 2px;
    height: calc(var(--care-depth) * var(--care-lane-h));
    background: var(--role-mark);
  }
  .care-at.is-today[data-side='below']::before {
    top: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  .care-at.is-today[data-side='above']::before {
    bottom: calc(-1 * var(--care-depth) * var(--care-lane-h));
  }
  .care-at.is-today[data-side='below'] .care-tick {
    top: calc(-6px - var(--care-depth) * var(--care-lane-h));
  }
  .care-at.is-today[data-side='above'] .care-tick {
    bottom: calc(-6px - var(--care-depth) * var(--care-lane-h));
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
  .care-at.is-today .care-what {
    color: var(--role-ink);
    font-weight: var(--weight-bold);
  }
  /* A day the rail could not reach, drawn at the end it was pulled in to.
     The caption still says the real date; the dotted tick is what says the
     mark is not where the day is. */
  .care-at.is-beyond .care-tick {
    background: repeating-linear-gradient(
      to bottom,
      var(--role-mark) 0 2px,
      transparent 2px 4px
    );
  }
</style>
