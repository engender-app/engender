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
  import { collapse } from '$lib/motion/reveal';
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
  class:is-active-card={selected}
  {...rest}
>
  <div class="proc-top">
    <!-- A row the width of the card answers a press with a wash rather than
         a scale: 0.94 on a 330px card walks its edges 10px inward while the
         list holds still, which reads as a yank (DIRECTION.md tier 1). -->
    <!-- No aria-label. One used to read `Open {name}`, which replaced the
         button's own content for a screen reader - so the name, the phase,
         the number and the date it counts from, all of which are inside
         this button, were announced as the single word `Open`. The content
         is the name now, and `aria-expanded` is what says the button
         toggles. -->
    <button
      type="button"
      class="proc-face"
      data-no-press
      aria-expanded={selected}
      aria-controls="procedure-log-{procedure.id}"
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

  <!-- The consult count stays written down even though the rail draws each
       consult as its own mark, because the rail is `aria-hidden` and a
       drawing nobody can hear is not where a fact may live. The photo count
       is here only on a collapsed card, which has no strip to count from.
       `collapse` because selecting a procedure is what brings the milestone
       and the checklist count in, and a row that cuts in is the yank the
       standing clause forbids. -->
  {#if linkedMilestone || checklistCount > 0 || procedure.consults.length > 0 || (!open && photos.length > 0)}
    <span class="proc-badges" transition:collapse|global>
      {#if linkedMilestone}
        <span class="proc-badge-tag" data-linked-milestone>
          <Icon name="flag" size={13} />
          <span>{m.surgery_milestone_linked_badge()}</span>
        </span>
      {/if}
      {#if procedure.consults.length > 0}
        <span class="proc-badge-tag">
          <Icon name="calendar" size={13} />
          <span>{procedure.consults.length}</span>
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
    position: relative;
    padding: var(--space-3) 0;
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
     opens. So the button's own box stays where its content is, for layout
     and for the accessible name, and its hit area is stretched over the
     card by a pseudo-element. The pencil lifts above it. */
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

  /* The kit's own row action size (--touch-target, Android's 48px floor),
     and above the face's stretched hit area rather than under it. */
  .proc-act {
    position: relative;
    z-index: 2;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: var(--touch-target);
    height: var(--touch-target);
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

  /* The wash a full-width row answers a press with, and the one the card
     wears while its log is showing below. Both are the control's own ground
     rather than a container's, which is the distinction carpet 30 settled -
     and it holds here because the face's hit area is the card, so the card
     is the control rather than a box around one. The wash fades rather than
     cutting in: selecting a procedure is a state change like any other. */
  .proc-card:has(.proc-face:active),
  .is-active-card {
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
