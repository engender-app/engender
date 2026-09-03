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
     filtered once, in the vocabulary, not by every caller re-deriving it. */
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
    <span class="presentation-highlight-label" id="presentation-highlight-label">
      {m.presentation_highlight_label()}
    </span>
    <div class="presentation-highlight-chips" role="radiogroup" aria-labelledby="presentation-highlight-label">
      {#each presentations as p (p.id)}
        {@const role = roleAt(activeFlag.roles, p.roleIndex)}
        <button
          type="button"
          class="presentation-highlight-chip press"
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

<style>
  .presentation-highlight {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .presentation-highlight-label {
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: 0.04em;
    color: var(--text-2);
    text-transform: uppercase;
  }

  .presentation-highlight-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  /* Same 36px pill and 48px hit area as .tag-chip (components.css): a chip
     is a chip everywhere in this app regardless of what picking it does. */
  .presentation-highlight-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 8px 14px;
    min-height: 36px;
    box-sizing: border-box;
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }
  .presentation-highlight-chip::after {
    content: '';
    position: absolute;
    inset: -6px 0;
  }

  /* A presentation's own colour rather than the app's accent, the same
     reason the entry editor's own chip takes it (ADR-0048): telling
     several of them apart at a glance is the whole point. Unselected,
     only the ring shows, at the hairline strength every role-coloured
     surface without a fill of its own draws at - a ring in the mark's full
     strength would read like a selected state on every palette that has
     one. Selected, the tint fills in behind the name. Neither state
     reaches for --accent: a highlight in the app's own accent colour would
     read as a flag stripe on some palettes (the ticket's own warning) and
     could be mistaken for a live selection rather than a chosen highlight. */
  .presentation-highlight-chip[data-kit-role] {
    border: var(--role-hairline);
  }
  .presentation-highlight-chip.is-active[data-kit-role] {
    background: var(--role-tint);
    border-color: var(--role-draw);
    color: var(--role-ink);
  }
</style>
