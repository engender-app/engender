<script lang="ts">
  import BreathingExercise from '$lib/components/BreathingExercise.svelte';
  import CurveMarkers from '$lib/components/CurveMarkers.svelte';
  import GenderConstellationChart from '$lib/components/GenderConstellationChart.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import WrappedCard from '$lib/components/WrappedCard.svelte';
  import type { ChartAnnotation } from '$lib/charts/annotations';

  const markers: ChartAnnotation[] = [{
    id: 'mark', kind: 'milestone', name: 'Logged milestone', shape: 'point',
    fromEpochDay: 1, toEpochDay: 1, startsInRange: true, endsInRange: true
  }];
</script>

<div data-direction-samples>
  <Segmented name="Narrow reading" compact value="first" options={[{ value: "first", label: "First" }, { value: "second", label: "Second" }]} onChange={() => {}} />
  <BreathingExercise />
  <Skeleton />
  <WrappedCard content={{ paletteArt: false, stats: [{ label: 'Entries', value: '3' }] }} />
  <GenderConstellationChart
    points={[
      { id: 'first', day: 1, x: 0.2, y: 0.3, presentationId: null },
      { id: 'last', day: 2, x: 0.7, y: 0.6, presentationId: null }
    ]}
    modes={[]}
    x={{ low: 'Low x', high: 'High x' }} y={{ low: 'Low y', high: 'High y' }}
    dayLabel={(day) => String(day)} readingLabel={(point) => String(point.day)}
    scrubLabel="Reading" ariaLabel="Two logged readings"
  />
  <svg viewBox="0 0 300 100" role="img" aria-label="Logged milestone marker">
    <CurveMarkers {markers} fromDay={0} toDay={2} left={0} right={300}
      bottom={90} plotHeight={80} onSelect={() => {}} />
  </svg>
</div>
