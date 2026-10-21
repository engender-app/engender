<script lang="ts">
  /* How the days fell: the days at each mood (phase 11 ticket 07). The
     tile's figure is the mood most days landed on and the share of days
     that was; its drawing is the strip. The screen draws the strip.

     "What you write about", the share by tag, was the second card here
     until functional audit ticket 12 moved it to Tags, beside every other
     tag reading on the door.

     The mood distribution takes no flag role: it is drawn on mood's own
     ramp (ADR-0025), the one colour system here that is not the flag's. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { moodDistribution } from '$lib/data/statsCharts';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { readingHref, topMoodStep } from '$lib/data/lookBackReadings';
  import type { Span } from '$lib/data/lookBackSpan';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import OrderedStrip from '$lib/components/kit/OrderedStrip.svelte';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';
  import { joinReadGroup } from '$lib/components/kit/readGroup.svelte';
  import { crossfade } from '$lib/motion/reveal';

  let {
    span,
    view = 'screen',
    enoughEntries = true
  }: { span: Span; view?: 'tile' | 'screen'; enoughEntries?: boolean } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);

  let moodQuery = liveList((j) => j.stats.dayAverages('mood', from, to));
  let distribution = $derived(moodDistribution(moodQuery.rows));
  let moodSteps = $derived(distribution.map((step) => ({ ...step, name: moodName(step.step) })));
  let top = $derived(topMoodStep(distribution));

  /* Whether there is a tile, or a card, is settled once the mood read
     answers (ReadGroup). */
  joinReadGroup(() => !moodQuery.loading);
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
  <ChartCard level={2} heading={m.stats_mood_days()} kind="mood-days">
    {#if moodQuery.loading}
      <div out:crossfade><Skeleton variant="block" count={1} /></div>
    {:else if enoughEntries}
      <OrderedStrip steps={moodSteps} />
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
