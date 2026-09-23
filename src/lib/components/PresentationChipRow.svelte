<script lang="ts">
  import { rovingRadio } from '$lib/components/rovingRadio';
  /* The presentation chip (phase 8 features ticket 17, ADR-0048): choosing
     a mode highlights the days logged under it on whatever chart sits
     below - tally, wear, voice and calendar all take this same row rather
     than each drawing their own, so the one control looks and behaves
     identically everywhere it appears.

     Highlighting, never filtering (ADR-0030's rule, restated for a mark
     rather than a list: rank or highlight, and never gate). The caller
     hands the chosen id straight to a query and to the chart; this
     component only ever renders the picker itself.

     Absent rather than empty when there are no modes to offer - the
     surface is data-gated the way ADR-0048 designed the entry editor's own
     chip, so a person who has never opened /more/presentations sees
     nothing here at all, not a control with nothing in it.

     Reads `vocabulary.visiblePresentations` itself rather than taking the
     list as a prop, the same division of labour the management screen and
     the entry editor's own chip already make: hidden presentations are
     filtered once, in the vocabulary, not by every caller re-deriving it.

     Built on the tag picker's own pill (.tag-chip, .tag-row, .tag-group-name
     in components.css) rather than a chip of its own: a presentation chip
     is a tag chip with one modifier layered on (.presentation-chip
     [data-kit-role], components.css), and EntryEditor's identical picker
     already takes that same modifier over its own base pill - two chip
     rows reaching for a presentation's colour is one modifier, not two
     chips (code review, ticket 17).

     Gated on `vocabulary.ready` through `ReadReserve` (ux-carpet ticket
     180), the same signal ticket 152 gave the mirror's other four
     consumers: on a cold navigation straight to a screen that hosts this
     row, the mirror is still empty at first paint, so "no modes to offer"
     and "the mirror hasn't answered yet" used to read as the same absent
     row, and the chips popped in at full height a few frames later,
     pushing whatever sits below (tally's charts, wear's log, voice's
     benchmarks, the calendar's hint) down in one frame. `ReadReserve`
     holds a fixed-height placeholder while `!ready` (a chip row barely
     varies in height, unlike Home's fold that primitive was built for, so
     a constant guess costs less than remembering one per visit), then
     fades the chips in - or, for a journal with no modes, fades in
     nothing and the placeholder collapses to it, margin included. Its
     wrapper carries no spacing of its own either way, so whichever of
     tally's `.screen`, the calendar's `.cal-month-body` grid, wear's
     `.screen`, or voice's `ReadGate` hosts it keeps spacing it exactly as
     it always did. A warm navigation (the mirror already filled from an
     earlier screen this session) has `ready` true from the first frame,
     so it renders the chips outright, no placeholder.

     `ReadReserve`'s own wrapper stays mounted, at rest, once ready and
     empty (Home's three slots never render nothing, so it was never asked
     to disappear outright) - fine for tally, wear and voice, whose `.kit-
     row` neighbours are spaced by a self-collapsing margin, but the
     calendar's `.cal-month-body` spaces its children with grid `gap`,
     which a still-present, zero-height grid item still earns on both
     sides. `settledEmpty` waits out the collapse's own `--dur-med` once
     ready turns up nothing, then drops the wrapper for good - after the
     margin travel above has already finished, so nothing left to see
     jumps when it goes. */
  import { m } from '$lib/paraglide/messages';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';
  import ReadReserve from './kit/ReadReserve.svelte';
  import { motionDuration } from '$lib/motion/tokens';

  let {
    value,
    onPick
  }: {
    /** The presentation currently highlighted, or `null` for "none" - the
        resting state a chart with no chip picked reads exactly as it did
        before this component existed. */
    value: string | null;
    onPick: (id: string | null) => void;
  } = $props();

  let presentations = $derived(vocabulary.visiblePresentations);

  /* One line of label plus one row of pills, measured on the demo persona
     at 66.5px - a little headroom over that. Unlike Home's fold (whose
     estimate is remembered per visit, homeReserve.ts), this row's height
     barely varies with what it turns out to hold, so a fixed guess is
     `resize`'d away in the rare case it is wrong rather than needing its
     own remembered height. */
  const ESTIMATE_PX = 68;

  let settledEmpty = $state(false);
  $effect(() => {
    if (!vocabulary.ready || presentations.length > 0) {
      settledEmpty = false;
      return;
    }
    const timer = setTimeout(() => (settledEmpty = true), motionDuration('--dur-med'));
    return () => clearTimeout(timer);
  });
</script>

{#if !settledEmpty}
  <ReadReserve ready={vocabulary.ready} estimate={ESTIMATE_PX} data-presentation-highlight-row>
    {#if presentations.length > 0}
      <div class="presentation-highlight">
        <span class="tag-group-name" id="presentation-highlight-label">
          {m.presentation_highlight_label()}
        </span>
        <div class="tag-row" role="radiogroup" use:rovingRadio aria-labelledby="presentation-highlight-label">
          {#each presentations as p (p.id)}
            {@const role = roleAt(activeFlag.roles, p.roleIndex)}
            <button
              type="button"
              class="tag-chip presentation-chip press"
              class:is-active={value === p.id}
              {...roleAttrs(role)}
              role="radio"
              aria-checked={value === p.id}
              data-presentation-highlight={p.id}
              onclick={() => onPick(value === p.id ? null : p.id)}
            >
              {p.name}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </ReadReserve>
{/if}
