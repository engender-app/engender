<script lang="ts">
  /* Draw the mood distribution on Look back in mood's own ramp.
     Leave it out below the entry floor or when no day
     in the span has a mood. Look back already explains sparse spans. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { moodDistribution } from '$lib/data/statsCharts';
  import { moodName } from '$lib/data/vocabulary/labels';
  import type { Span } from '$lib/data/lookBackSpan';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import OrderedStrip from '$lib/components/kit/OrderedStrip.svelte';
  import { joinReadGroup } from '$lib/components/kit/readGroup.svelte';

  let { span, enoughEntries = true }: { span: Span; enoughEntries?: boolean } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);

  let moodQuery = liveList((j) => j.stats.dayAverages('mood', from, to));
  let distribution = $derived(moodDistribution(moodQuery.rows));
  let moodSteps = $derived(distribution.map((step) => ({ ...step, name: moodName(step.step) })));
  let anyDays = $derived(distribution.some((step) => step.count > 0));

  /* Whether there is a card is settled once the mood read answers
     (ReadGroup), so it arrives with the tiles under it, never after. */
  joinReadGroup(() => !moodQuery.loading);
</script>

{#if !moodQuery.loading && enoughEntries && anyDays}
  <ChartCard level={2} heading={m.stats_mood_days()} kind="mood-days">
    <OrderedStrip
      steps={moodSteps}
      countShort={(n) => m.strip_days_short({ n })}
      countFull={(n) => m.n_days({ n })}
    />
  </ChartCard>
{/if}
