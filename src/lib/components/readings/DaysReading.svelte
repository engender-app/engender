<script lang="ts">
  /* How the days fell: the days at each mood (phase 11 ticket 07), drawn
     on the Look back door itself under the reading tiles. It used to be a
     tile of its own, "Mood across your days", opening a screen that held
     this one strip and nothing else; Alicja's sign-off on functional audit
     ticket 12 took the tile and the screen out ("if it's just a single
     chart, it should display a screen before"), which also left the door
     an even number of tiles.

     "What you write about", the share by tag, was the second card here
     until functional audit ticket 12 moved it to Tags, beside every other
     tag reading on the door.

     Absent rather than empty, like the tiles: under the floor, or over a
     span with no mood on any day, the door's own thin-span line already
     says why there is nothing, so this draws nothing.

     The mood distribution takes no flag role: it is drawn on mood's own
     ramp (ADR-0025), the one colour system here that is not the flag's. */
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
     (ReadGroup), so it arrives with the tiles above it, never after. */
  joinReadGroup(() => !moodQuery.loading);
</script>

{#if !moodQuery.loading && enoughEntries && anyDays}
  <ChartCard level={2} heading={m.stats_mood_days()} kind="mood-days">
    <OrderedStrip steps={moodSteps} />
  </ChartCard>
{/if}
