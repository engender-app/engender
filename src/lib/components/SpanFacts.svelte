<script lang="ts">
  /* The rail's marks can be as small as 6px. The disclosed list supplies full-width targets
     and exact dates for the same facts. Keep each row's selection aligned with factSpan so
     it chooses the same span as the rail. Use BatchedList for long journals. */
  import { m } from '$lib/paraglide/messages';
  import { factSpan, type RailFact, type RailFactKind, type Span } from '$lib/data/lookBackSpan';
  import { dayLabel, spanLabel } from '$lib/data/spanLabel';
  import { disclose } from '$lib/motion/reveal';
  import type { Role } from '$lib/theme/roles';
  import Icon from './Icon.svelte';
  import BatchedList from './kit/BatchedList.svelte';
  import ListRow from './kit/ListRow.svelte';

  let {
    facts,
    railStart,
    today,
    span,
    role,
    onPick
  }: {
    /** Every fact on the rail, newest first (`railFacts`). */
    facts: RailFact[];
    railStart: number;
    today: number;
    /** The span as the door has it, so the row that set it says so. */
    span: Span;
    role?: Role;
    onPick: (span: Span) => void;
  } = $props();

  let open = $state(false);

  /* The words the chart annotations already use for these five kinds, in
     both catalogues: a fact the person never named reads as its kind, and
     one they did names its kind beside its dates. */
  const KIND_WORD: Record<RailFactKind, () => string> = {
    era: () => m.chart_annotation_era(),
    regimen: () => m.chart_annotation_regimen(),
    tryout: () => m.chart_annotation_tryout(),
    milestone: () => m.chart_annotation_milestone(),
    surgery: () => m.chart_annotation_surgery()
  };

  const factName = (fact: RailFact) => fact.name ?? KIND_WORD[fact.kind]();
  /* What the row says about time: a stretch's two days and its length, the
     same line the rail writes under itself, or a day's own date - in the
     same words, so a list holding both does not read in two registers. */
  const factWhen = (fact: RailFact) =>
    fact.isDay ? dayLabel(fact.end, today) : spanLabel({ start: fact.start, end: fact.end }, today);
</script>

<div class="span-facts" data-span-facts>
  <!-- A full-width fold toggle answers with the wash, not a scale. -->
  <button
    type="button"
    class="disclosure-toggle"
    data-no-press
    aria-expanded={open}
    data-span-facts-toggle
    onclick={() => (open = !open)}
  >
    <span>{m.lookback_pick_disclosure()}</span>
    <span class="disclosure-chev"><Icon name="chevronDown" size={18} /></span>
  </button>

  {#if open}
    <div class="disclosed" transition:disclose>
      <BatchedList items={facts} key="lookback-facts" {role}>
        {#snippet rows(shown)}
          {#each shown as fact (fact.id)}
            {@const next = factSpan(fact, railStart)}
            {@const selected = span.start === next.start && span.end === next.end}
            <!-- No aria-label: a label would replace what the row says, and
                 what the row says - the fact's name, its kind and its exact
                 dates - is more than the rail's own one-line announcement
                 carries. The rail keeps that announcement; this list reads
                 itself out.

                 `aria-current` is what says which fact the span on the rail
                 came from. Not `aria-selected`, which is a listbox's word
                 and would mean giving these rows `role="option"` inside a
                 `role="listbox"` - a different keyboard contract (one tab
                 stop, arrows between options) from the one the kit's rows
                 have everywhere else in the app. Not `aria-pressed`, which
                 would make each row a toggle and promise it can be
                 unpressed; a span always comes from somewhere. -->
            <ListRow
              key={fact.id}
              data-span-fact={fact.kind}
              title={factName(fact)}
              subtitle={`${KIND_WORD[fact.kind]()} · ${factWhen(fact)}`}
              chevron={false}
              aria-current={selected ? 'true' : undefined}
              onclick={() => onPick(next)}
            >
              {#snippet trailing()}
                <!-- The plain mark rather than kit/Check, which draws the
                     box a tickable row wears: this row is not a checkbox
                     and ticking a box would say a person may select as many
                     facts as they like. One span, one row, one mark. -->
                {#if selected}<Icon name="check" size={22} cls="span-fact-mark" />{/if}
              {/snippet}
            </ListRow>
          {/each}
        {/snippet}
      </BatchedList>
    </div>
  {/if}
</div>

<style>
  /* The mark on the row the span came from, in the area's own ink. */
  .span-facts :global(.span-fact-mark) {
    color: var(--role-ink);
  }
</style>
