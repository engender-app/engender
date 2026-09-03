<script lang="ts">
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
     chips (code review, ticket 17). */
  import { m } from '$lib/paraglide/messages';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';

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
</script>

{#if presentations.length > 0}
  <div class="presentation-highlight">
    <span class="tag-group-name" id="presentation-highlight-label">
      {m.presentation_highlight_label()}
    </span>
    <div class="tag-row" role="radiogroup" aria-labelledby="presentation-highlight-label">
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
