<script lang="ts">
  /* One procedure on the surgery index (phase 5 ticket 12, rebuilt by phase
     10 redesign ticket 52).

     It used to be a list row: a title, a phase pill, the date and the day
     count run together in secondary grey, and a row of count badges. The
     thing in the app with the most phases had the fewest pixels - a real
     journey with two consults, a date, a recovery and a photo taken during
     it came out as one 60px row, and none of those four facts surfaced
     until the row was opened.

     So the card says what is true now (DIRECTION.md rule 16) in the two
     ways the rule's worked examples do. The live reading - day N of
     healing, or the days until the operation - is the number on the card,
     on a block of the area's stripe at display size, which is rule 2's "a
     number on a block" and the shape LetterCard already uses for a wait.
     And the journey itself is a line: consults behind, the date as the
     pivot, the stretch to today ahead of it (ProcedurePhaseRail).

     Nothing on it is a score. Day N is a fact about time, not a position in
     a recovery anybody is meant to be at (ADR-0012), and the rail draws no
     horizon to be short of.

     **Open and collapsed.** A procedure still running draws all of it. One
     past the recovery cutoff collapses to about the height of the row it
     drew before this ticket: its phases are still on the rail, but the
     number belongs to a reading that is still live, and an operation four
     hundred days ago has none. What it keeps instead is exactly what it
     said before - the date, the day count and `Permanent record` - because
     ticket 52 holds the archived wording to mean what it already meant.
     That is also what lets several running procedures fit at once, which
     the screen's own intro promises. */
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import ProcedurePhaseRail from './ProcedurePhaseRail.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { procedurePhase, recoveryDay, type ProcedurePhase } from '$lib/data/recoveryDay';
  import type { ProcedurePhoto } from '$lib/data/journal/procedures';
  import type { Milestone, Procedure } from '$lib/data/types';

  let {
    procedure,
    selected = false,
    today = todayEpochDay(),
    linkedMilestone = null,
    photos = [],
    checklistCount = 0,
    onclick,
    onedit,
    ...rest
  }: {
    procedure: Procedure;
    selected?: boolean;
    today?: number;
    linkedMilestone?: Milestone | null;
    /** This procedure's recovery photos, oldest first. The strip is drawn
        from them rather than from a count, so the card shows the healing
        rather than reporting how much of it was photographed. */
    photos?: readonly ProcedurePhoto[];
    checklistCount?: number;
    onclick?: () => void;
    onedit?: () => void;
    [key: string]: unknown;
  } = $props();

  let phase = $derived<ProcedurePhase>(procedurePhase(procedure.surgeryEpochDay, today));
  let recDay = $derived(recoveryDay(procedure.surgeryEpochDay, today));

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
        return m.surgery_phase_surgery_day();
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
    return { n: null, unit: m.surgery_reading_no_date() };
  });

  const dayLabel = (epochDay: number) =>
    fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  /* The date line, and only the date once the reading is a number above it:
     the grey subtitle running "3 Aug 2025 · 42 days since surgery" is the
     duplication this ticket is named for. An archived card has no number,
     so it keeps the whole of the sentence it said before, `Permanent
     record` included. */
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

  /** How many thumbs fit across a phone's column beside each other. Past
      it the strip says how many more there are rather than scrolling
      sideways inside a card, which is a gesture a list of cards cannot
      afford to own. */
  const STRIP_CAP = 6;
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
  class:is-active-card={selected}
  {...rest}
>
  <div class="proc-top">
    <!-- A row the width of the card answers a press with a wash rather than
         a scale: 0.94 on a 330px card walks its edges 10px inward while the
         list holds still, which reads as a yank (DIRECTION.md tier 1). -->
    <button
      type="button"
      class="proc-face"
      data-no-press
      aria-expanded={selected}
      aria-label={m.surgery_row_aria({ name: procedure.name })}
      {onclick}
    >
      <span class="proc-head">
        <span class="proc-name">{procedure.name}</span>
        <span class="kit-pill proc-phase-pill" data-phase-pill={phase}>{phaseLabel}</span>
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
    </button>
    {#if onedit}
      <button
        type="button"
        class="proc-act"
        data-edit-procedure={procedure.id}
        aria-label={m.surgery_edit_sheet()}
        onclick={onedit}
      >
        <Icon name="pencil" size={18} />
      </button>
    {/if}
  </div>

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

  {#if linkedMilestone || checklistCount > 0 || (!open && photos.length > 0)}
    <span class="proc-badges">
      {#if linkedMilestone}
        <span class="proc-badge-tag" data-linked-milestone>
          <Icon name="flag" size={13} />
          <span>{m.surgery_milestone_linked_badge()}</span>
        </span>
      {/if}
      {#if !open && photos.length > 0}
        <span class="proc-badge-tag">
          <Icon name="image" size={13} />
          <span>{photos.length}</span>
        </span>
      {/if}
      {#if checklistCount > 0}
        <span class="proc-badge-tag">
          <Icon name="check" size={13} />
          <span>{checklistCount}</span>
        </span>
      {/if}
    </span>
  {/if}
</div>

<style>
  /* Flush, per rule 4 - what makes this read as an object is the block and
     the line on it, not a box. The hairline between two of them belongs to
     the list card holding the run, which is what `rows-divide` opts into. */
  .proc-card {
    padding: var(--space-3) 0;
  }

  .proc-top {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
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

  .proc-phase-pill {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.04em;
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

  /* 15px on a stripe would owe 4.5:1, which no band carries, so the word
     beside the number steps up to the 19px rule 2 allows a title written on
     a block and answers to 3:1. */
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
    color: var(--text-2);
  }

  .proc-act {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    background: none;
    border: 0;
    border-radius: var(--r-block);
    color: var(--text-2);
    cursor: pointer;
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

  /* The wash a full-width row answers a press with, and the one the open
     card wears while its log is showing below. Both are the control's own
     ground rather than a container's, which is the distinction carpet 30
     settled. */
  .proc-top:has(.proc-face:active) {
    background: var(--role-wash);
  }

  .is-active-card {
    background: var(--role-wash);
  }

  @media (prefers-reduced-motion: reduce) {
    .proc-block,
    .proc-shot {
      animation: none;
    }
  }

  :global(html[data-a11y-motion='reduce']) .proc-block,
  :global(html[data-a11y-motion='reduce']) .proc-shot {
    animation: none;
  }
</style>
