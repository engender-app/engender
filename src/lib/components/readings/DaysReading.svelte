<script lang="ts">
  /* How the days fell: the days at each mood and what they were written
     about, one reading (phase 11 ticket 07 folded the two cards into one
     tile, since both ask what the span was made of). The tile's figure is
     the mood most days landed on and the share of days that was; its
     drawing is the strip. The screen draws both cards as the door did.

     The mood distribution takes no flag role: it is drawn on mood's own
     ramp (ADR-0025), the one colour system here that is not the flag's.
     The donut carries the card's stripe through its own tint ladder, so
     the frame takes none either. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { moodDistribution } from '$lib/data/statsCharts';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { readingHref, topMoodStep } from '$lib/data/lookBackReadings';
  import type { Span } from '$lib/data/lookBackSpan';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { Part } from '$lib/charts/parts';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import Donut from '$lib/components/kit/Donut.svelte';
  import OrderedStrip from '$lib/components/kit/OrderedStrip.svelte';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';
  import { crossfade } from '$lib/motion/reveal';

  let {
    span,
    view = 'screen',
    enoughEntries = true
  }: { span: Span; view?: 'tile' | 'screen'; enoughEntries?: boolean } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);
  const CHART_ROLE = 0;

  let moodQuery = liveList((j) => j.stats.dayAverages('mood', from, to));
  let distribution = $derived(moodDistribution(moodQuery.rows));
  let moodSteps = $derived(distribution.map((step) => ({ ...step, name: moodName(step.step) })));
  let top = $derived(topMoodStep(distribution));

  /* Share by tag (ADR-0058). `tagShare` and not the recap's `topTags`: a
     parts-of-a-whole form computes each share against the sum of what it
     is handed, and a LIMIT 3 read drew three tags as a full circle. */
  let tagShareQuery = liveList((j) => j.stats.tagShare(from, to));
  let tagParts = $derived<Part[]>(
    tagShareQuery.rows.map((tag) => ({
      key: tag.id,
      name: vocabulary.tag(tag.id)?.label ?? tag.id,
      amount: tag.count
    }))
  );
  /* The whole the ring is a ring of: tag uses, not entries. */
  let tagUses = $derived(tagParts.reduce((sum, part) => sum + part.amount, 0));

  let loading = $derived(moodQuery.loading || tagShareQuery.loading);
</script>

{#if view === 'tile'}
  {#if !moodQuery.loading && enoughEntries && top}
    <ReadingTile
      key="days"
      name={m.stats_reading_days()}
      href={readingHref('days', span)}
      headline={moodName(top.step)}
      note={m.progress_percent({ percent: String(Math.round(top.share * 100)) })}
    >
      {#snippet drawing()}
        <!-- The strip in miniature: five steps in sequence on mood's own
             ramp, each as wide as its share, a step nothing landed on
             holding its place at no width. -->
        <span class="days-strip">
          {#each distribution as step (step.step)}
            <span class="days-seg" style={`flex: ${step.count}; background: var(--mood-${step.step})`}></span>
          {/each}
        </span>
      {/snippet}
    </ReadingTile>
  {/if}
{:else}
  <ChartCard heading={m.stats_mood_days()} kind="mood-days">
    {#if loading}
      <div out:crossfade><Skeleton variant="block" count={1} /></div>
    {:else if enoughEntries}
      <OrderedStrip steps={moodSteps} />
    {:else}
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/if}
  </ChartCard>

  <ChartCard heading={m.stats_tag_share()} kind="tag-share" role={roleAt(activeFlag.roles, CHART_ROLE)}>
    {#if loading}
      <div out:crossfade><Skeleton variant="block" count={1} /></div>
    {:else if enoughEntries && tagParts.length}
      <Donut parts={tagParts} restName={m.stats_tag_share_rest()} total={String(tagUses)} note={m.stats_tag_share_note()} />
    {:else}
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/if}
  </ChartCard>
{/if}

<style>
  .days-strip {
    display: flex;
    gap: 2px;
    width: 100%;
    height: 14px;
    margin-top: auto;
    border-radius: 2px;
    overflow: hidden;
  }

  .days-seg {
    display: block;
    height: 100%;
    min-width: 0;
  }
</style>
