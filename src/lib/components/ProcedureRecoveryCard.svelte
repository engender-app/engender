<script lang="ts">
  /* The surgery index shows one card per procedure. The active card
     gives the time until the operation or the current recovery day
     on a role-coloured block. ProcedurePhaseRail places consults
     and recovery around surgery day. recoveryDay.ts gives the
     elapsed time. The rail sets no recovery target.

     Only the person's archive switch collapses the card. The
     archived card retains the phase rail, consult count, date and
     day count while omitting the live number block and strip. */
  import { m } from '$lib/paraglide/messages';
  import { collapse } from '$lib/motion/reveal';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import ProcedurePhaseRail from './ProcedurePhaseRail.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { currentDay } from '$lib/stores/today.svelte';
  import { procedurePhase, recoveryDay, type ProcedurePhase } from '$lib/data/recoveryDay';
  import { gapTo } from '$lib/data/vocabulary/hubLabels';
  import { costLine } from '$lib/data/vocabulary/costLabel';
  import type { ProcedurePhoto } from '$lib/data/journal/procedures';
  import type { Milestone, Procedure } from '$lib/data/types';

  let {
    procedure,
    today = currentDay(),
    linkedMilestone = null,
    photos = [],
    checklistCount = 0,
    ...rest
  }: {
    procedure: Procedure;
    today?: number;
    linkedMilestone?: Milestone | null;
    /** This procedure's recovery photos, oldest first. The strip is drawn
        from them rather than from a count, so the card shows the healing
        rather than reporting how much of it was photographed. */
    photos?: readonly ProcedurePhoto[];
    checklistCount?: number;
    [key: string]: unknown;
  } = $props();

  let phase = $derived<ProcedurePhase>(procedurePhase(procedure.surgeryEpochDay, today, procedure.archived));
  let recDay = $derived(recoveryDay(procedure.surgeryEpochDay, today));
  let cost = $derived(costLine(procedure.cost));

  /** Everything but the archived phase, which is the one with no live
      reading left to draw. */
  let open = $derived(phase !== 'archived');

  let phaseLabel = $derived.by(() => {
    switch (phase) {
      case 'planning':
        return m.surgery_phase_planning();
      case 'pre_op':
        return m.surgery_phase_pre_op();
      case 'surgery_day':
        return m.surgery_day();
      case 'recovery':
        return m.surgery_phase_recovery();
      case 'archived':
        return m.surgery_phase_archived();
    }
  });

  /* The reading, as a number and the word that says what it counts - or as
     one line at display size where there is no number, which is the kit's
     own rule for a block with nothing to report (kit.css, a tile with no
     value). Surgery day and a procedure with no date yet are the two. */
  let reading = $derived.by<{ n: number | null; unit: string }>(() => {
    if (recDay.type === 'upcoming') return { n: recDay.days, unit: m.surgery_unit_to_go({ n: recDay.days }) };
    if (recDay.type === 'since') return { n: recDay.days, unit: m.surgery_unit_post_op({ n: recDay.days }) };
    /* `Today` rather than `Surgery day`, which is what the pill beside it
       already says: the pill names the phase and the block is the reading,
       and a card that writes one fact twice in two type sizes is the
       duplication this ticket is named for. */
    if (recDay.type === 'surgeryDay') return { n: null, unit: m.today() };
    return { n: null, unit: m.no_date_yet() };
  });

  const dayLabel = (epochDay: number) =>
    fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  /* The date line, and only the date once the reading is a number above it:
     the grey subtitle running "3 Aug 2025 · 42 days since surgery" is the
     duplication this ticket is named for. An archived card has no number,
     so it keeps the day count beside the date. */
  let dateDetail = $derived.by(() => {
    /* Nothing, rather than `no date set` under a block that has just said
       `No date yet` in forty-point type. */
    if (procedure.surgeryEpochDay === null) return open ? '' : m.surgery_date_none();
    const formatted = dayLabel(procedure.surgeryEpochDay);
    if (!open && recDay.type === 'since') {
      return `${formatted} · ${m.surgery_archived_summary({ days: String(recDay.days) })}`;
    }
    return formatted;
  });

  /* What is next for this procedure, which the card had nowhere to say
     (audit item 13): the screen ended at 520px with the journey's own
     forward fact locked inside the open card's consult list. The nearest
     consult from today on, in ticket 12's grammar - `gapTo` and the same
     two strings a hub row uses for a consult, so a row saying "Consult in
     12 days" and this card cannot come to disagree about either the
     arithmetic or the words.

     Only a card still running: an archived procedure keeps no forward
     reading (`open`'s own rule above), and a consult dated after one is a
     record of something else. */
  let nextConsult = $derived(
    open
      ? [...procedure.consults]
          .filter((consult) => consult.epochDay >= today)
          .sort((a, b) => a.epochDay - b.epochDay)[0] ?? null
      : null
  );
  let nextConsultLine = $derived(
    nextConsult === null
      ? null
      : nextConsult.epochDay === today
        ? m.hub_line_next_consult_today()
        : m.hub_line_next_consult({ gap: gapTo(nextConsult.epochDay, today) })
  );

  /** How many thumbs fit across a phone's column beside each other. Five,
      because the narrowest screen the app supports is 320px and leaves a
      280px column: 5 x 44 + 4 x 8 is 252px and six of them is 304px, which
      wraps to a second row. Past the cap the strip says how many more there
      are rather than scrolling sideways inside a card, which is a gesture a
      list of cards cannot afford to own. */
  const STRIP_CAP = 5;
  let strip = $derived(photos.slice(0, STRIP_CAP));
  let stripMore = $derived(photos.length - strip.length);

  /* A recovery photo's own caption is which day of healing it is from,
     which is the whole reason this photo table carries a date of its own
     (procedures.ts). Before the operation, or with no date to count from,
     it is the day it was taken. */
  const photoLabel = (photo: ProcedurePhoto): string =>
    procedure.surgeryEpochDay !== null && photo.epochDay >= procedure.surgeryEpochDay
      ? m.surgery_photo_day({ days: String(photo.epochDay - procedure.surgeryEpochDay) })
      : dayLabel(photo.epochDay);
</script>

<div
  class="proc-card rows-divide"
  data-procedure-card={procedure.id}
  data-procedure={procedure.id}
  data-phase={phase}
  class:is-open={open}
  {...rest}
>
  <div class="proc-top">
    <!-- A row the width of the card answers a press with a wash rather than
         a scale: 0.94 on a 330px card walks its edges 10px inward while the
         list holds still, which reads as a yank (DIRECTION.md tier 1). -->
    <!-- A link to the procedure's own screen (prh12 bug 20), the way a
         tryout's card links to its own (TryoutCard). It used to be a button
         that slid the procedure's log open under the list. No aria-label:
         the name, the phase, the number and the date are all inside the
         link, and a label would replace them for a screen reader. -->
    <a
      class="proc-face"
      href="/health/surgery/{procedure.id}"
      data-no-press
      data-open-procedure={procedure.id}
    >
      <span class="proc-head">
        <span class="proc-name">{procedure.name}</span>
        <!-- An archived card only ever sits under the "Archived procedures"
             heading, so its pill would say the heading again. One archived
             before its operation keeps its pill: Pre-op under that heading
             still says something the heading does not. -->
        {#if phase !== 'archived'}
          <span class="kit-pill proc-phase-pill" data-phase-pill={phase}>{phaseLabel}</span>
        {/if}
      </span>
      {#if open}
        <!-- The number and the date it counts from, side by side: the block
             is what the card reports and the date is what it is measured
             against, which is the pairing every figure in the app keeps. -->
        <span class="proc-reading">
          <span class="proc-block" data-procedure-reading={phase}>
            {#if reading.n !== null}<span class="proc-n">{reading.n}</span>{/if}
            <span class="proc-unit" class:is-alone={reading.n === null}>{reading.unit}</span>
          </span>
          {#if dateDetail}<span class="proc-when">{dateDetail}</span>{/if}
        </span>
      {:else}
        <span class="proc-when">{dateDetail}</span>
      {/if}
    </a>
  </div>

  <!-- Between the reading and the rail: the block says how far off the
       operation is, this says what happens before it, and the rail draws
       both without words (audit item 13). `aria-hidden` on the rail is why
       the consult has to be written as well as drawn - the same reason the
       consult count below it is kept. -->
  {#if nextConsultLine}
    <p class="proc-next" data-procedure-next={procedure.id}>{nextConsultLine}</p>
  {/if}

  <ProcedurePhaseRail {procedure} {today} />

  {#if open && strip.length}
    <!-- The photos ride under the rail in the order they were taken, each
         captioned with the day of healing it is from. They are not placed
         at their positions along the line: a root scale puts the first
         fortnight's photos inside 40px of it, and six 44px thumbs there
         would be a pile rather than a strip. -->
    <div class="proc-strip" data-procedure-strip={procedure.id}>
      {#each strip as photo, index (photo.id)}
        <figure class="proc-shot" style={`--shot-index: ${index}`}>
          <PhotoThumb {photo} size={44} />
          <figcaption class="proc-shot-day">{photoLabel(photo)}</figcaption>
        </figure>
      {/each}
      {#if stripMore > 0}
        <p class="proc-shot-more">{m.surgery_photo_more({ n: stripMore })}</p>
      {/if}
    </div>
  {/if}

  <!-- The consult count stays written down even though the rail draws each
       consult as its own mark, because the rail is `aria-hidden` and a
       drawing nobody can hear is not where a fact may live. Each number
       says what it counts in hidden words, since the glyph beside it is
       hidden too and "2 3" is not a fact (after-release 21). The photo count
       is here only on a collapsed card, which has no strip to count from.
       `collapse` because selecting a procedure is what brings the milestone
       and the checklist count in, and a row that cuts in is the yank the
       standing clause forbids. -->
  {#if linkedMilestone || checklistCount > 0 || procedure.consults.length > 0 || (!open && photos.length > 0) || cost}
    <span class="proc-badges" transition:collapse|global>
      {#if linkedMilestone}
        <span class="proc-badge-tag" data-linked-milestone>
          <Icon name="summit" size={13} />
          <span>{m.surgery_milestone_linked_badge()}</span>
        </span>
      {/if}
      {#if procedure.consults.length > 0}
        <span class="proc-badge-tag">
          <Icon name="appointment" size={13} />
          <span aria-hidden="true">{procedure.consults.length}</span>
          <span class="visually-hidden">{m.surgery_badge_consults({ n: procedure.consults.length })}</span>
        </span>
      {/if}
      {#if !open && photos.length > 0}
        <span class="proc-badge-tag">
          <Icon name="image" size={13} />
          <span aria-hidden="true">{photos.length}</span>
          <span class="visually-hidden">{m.n_photos({ n: photos.length })}</span>
        </span>
      {/if}
      {#if checklistCount > 0}
        <span class="proc-badge-tag">
          <Icon name="check" size={13} />
          <span aria-hidden="true">{checklistCount}</span>
          <span class="visually-hidden">{m.surgery_badge_checklist({ n: checklistCount })}</span>
        </span>
      {/if}
      <!-- What it cost, as words: no glyph in
           the set says money, and the amount is its own label. -->
      {#if cost}
        <span class="proc-badge-tag" data-procedure-cost>{cost}</span>
      {/if}
    </span>
  {/if}
</div>

<style>
  /* Flush, per rule 4 - what makes this read as an object is the block and
     the line on it, not a box. The hairline between two of them belongs to
     the list card holding the run, which is what `rows-divide` opts into. */
  .proc-card {
    position: relative;
    padding: var(--space-3) 0;
  }

  /* The forward line sits between the reading and the rail, in the page's
     own secondary ink: it is a fact about time and not a verdict about it
     (ADR-0012), so nothing here is coloured, emphasised or counted down in
     a unit of its own. */
  .proc-next {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .proc-top {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  /* The whole card is the control, not its top row. The rail, the strip
     and the badges are the card's own reading and there is nothing on any
     of them to reach - a 44px wound photo that answers no touch at all is
     the worst of the three, because every convention says a thumbnail
     opens. So the link's own box stays where its content is, for layout
     and for the accessible name, and its hit area is stretched over the
     card by a pseudo-element. */
  .proc-face::after {
    content: '';
    position: absolute;
    inset: 0;
    /* Above the rail, which is positioned in its own right, and above the
       strip's images - without this the pseudo-element paints under both
       and a tap on either lands on nothing. */
    z-index: 1;
  }

  .proc-face {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .proc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
  }

  .proc-name {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* No uppercase, no tracking. DIRECTION.md's own census names an
     uppercase tracked label as the craft floor's tell and declines it; the
     row this card replaced carried one, and rebuilding the card around it
     would have kept it for another ticket. */
  .proc-phase-pill {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    flex: 0 0 auto;
  }

  /* The number on the card. The block is the flag stripe undiluted and the
     words on it take the ink proven against that stripe rather than the
     role's small-text ink, which is below 4.5:1 on most bands and absent on
     one (role.ts). */
  .proc-reading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .proc-block {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    min-width: 92px;
    max-width: 150px;
    text-align: center;
    padding: var(--space-1) var(--space-3) var(--space-2);
    background: var(--role-draw, var(--accent));
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--role-fill-ink);
    /* The kit's own block arrival: a block is uncovered from its own left
       edge and clips, never fades up from nothing. */
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
  }

  .proc-n {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  /* 19px rather than the 15px a secondary line takes, because this one is
     written on the stripe itself. It is not large text by WCAG's measure -
     that needs 18.66px at weight 700 - so it owes 4.5:1 and gets it:
     `--role-fill-ink` is the heat ramp's deepest step, held to 4.5:1
     against its own fill by tests/kit-roles.test.ts. */
  .proc-unit {
    font-size: var(--text-block);
    font-weight: var(--weight-medium);
    line-height: 1.2;
  }

  /* With no number to stand beside, the word takes the number's place and
     its size - the same rule a kit tile with nothing to report follows, so
     every block in the app carries one line at display size. */
  .proc-unit.is-alone {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1.1;
  }

  .proc-when {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .proc-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .proc-shot {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    /* Uncovered from its own left edge in turn, so a strip lands as a strip
       rather than six thumbs appearing together in one frame. */
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--shot-index, 0) * var(--stagger-step));
  }

  .proc-shot-day {
    font-size: var(--text-xs);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .proc-shot-more {
    margin: 0;
    align-self: center;
    font-size: var(--text-xs);
    color: var(--text-2);
  }

  .proc-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .proc-badge-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--text-xs);
    color: var(--text-2);
  }

  /* The wash a full-width row answers a press with. It is the control's
     own ground rather than a container's, which is the distinction carpet
     30 settled - and it holds here because the face's hit area is the
     card, so the card is the control rather than a box around one. The
     wash fades rather than cutting in. */
  .proc-card:has(.proc-face:active) {
    background: var(--role-wash);
  }

  .proc-card {
    transition: background var(--dur-fast) var(--ease-out);
  }

  @media (prefers-reduced-motion: reduce) {
    .proc-block,
    .proc-shot {
      animation: none;
    }

    .proc-card { transition: none; }
  }

  :global(html[data-a11y-motion='reduce']) .proc-block,
  :global(html[data-a11y-motion='reduce']) .proc-shot {
    animation: none;
  }

  :global(html[data-a11y-motion='reduce']) .proc-card { transition: none; }
</style>
