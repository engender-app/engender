<script lang="ts">
  /* The rail's facts as a list (phase 11 UI/UX ticket 25, first audit U4).

     The rail draws a history as a picture: eras 52px tall but a regimen
     episode 8px, a tryout 6px and a milestone a 12px block. The picture is
     the point - it says where a life's stretches lie against each other -
     but selecting a fact on it is a tap at a target measured in single
     digits, and the audit measured them. So the same facts are also a list,
     under the rail and folded away until somebody wants it: one row per
     fact, its own dates written out, the whole row the target, and the row
     it selects the same span the band on the rail selects (lookBackSpan.ts,
     `factSpan`).

     Not a replacement for the rail. A person who can hit an 8px band keeps
     hitting it, and the rail keeps every one of its own tab stops; this is
     the way through for a finger, a magnified screen, or anyone who wants
     to know the exact dates before choosing rather than after.

     Bounded the way every long list in this app is bounded - BatchedList,
     ADR-0069 - so a journal with two hundred milestones renders a batch and
     grows as it is read rather than laying two hundred rows under the
     door. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { factSpan, type RailFact, type RailFactKind, type Span } from '$lib/data/lookBackSpan';
  import { spanLabel } from '$lib/data/spanLabel';
  import { disclose } from '$lib/motion/reveal';
  import type { Role } from '$lib/theme/roles';
  import Icon from './Icon.svelte';
  import BatchedList from './kit/BatchedList.svelte';
  import Check from './kit/Check.svelte';
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
  const dayText = (day: number) => fmtDay(day, { day: 'numeric', month: 'long', year: 'numeric' });
  /* What the row says about time: a stretch's two days and its length, the
     same line the rail writes under itself, or a day's own date. */
  const factWhen = (fact: RailFact) =>
    fact.isDay ? dayText(fact.end) : spanLabel({ start: fact.start, end: fact.end }, today);
  /* No `aria-label` on a row: the label would replace what the row says,
     and what the row says - its name, its kind and its exact dates - is
     more than the rail's own one-line announcement carries. The rail keeps
     that announcement; this list reads itself out. */
</script>

<div class="span-facts" data-span-facts>
  <button
    type="button"
    class="span-facts-toggle"
    aria-expanded={open}
    data-span-facts-toggle
    onclick={() => (open = !open)}
  >
    <span>{m.lookback_pick_disclosure()}</span>
    <span class="span-facts-chev"><Icon name="chevronDown" size={18} /></span>
  </button>

  {#if open}
    <div class="disclosed" transition:disclose|local>
      <BatchedList items={facts} key="lookback-facts" {role}>
        {#snippet rows(shown)}
          {#each shown as fact (fact.id)}
            {@const next = factSpan(fact, railStart)}
            {@const selected = span.start === next.start && span.end === next.end}
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
                {#if selected}<Check checked />{/if}
              {/snippet}
            </ListRow>
          {/each}
        {/snippet}
      </BatchedList>
    </div>
  {/if}
</div>

<style>
  /* The same fold the dose log's own attribution note wears: a full-width
     row of the secondary ink with its chevron at the far edge, so the two
     disclosures in the app read as one control. */
  .span-facts-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--touch-target);
    padding: var(--space-2) 0;
    border: 0;
    background: none;
    color: var(--text-2);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }
  .span-facts-chev {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    transition: transform var(--dur-med) var(--ease-out);
  }
  .span-facts-toggle[aria-expanded='true'] .span-facts-chev {
    transform: rotate(180deg);
  }
</style>
