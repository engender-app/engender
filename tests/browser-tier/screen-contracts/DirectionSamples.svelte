<script lang="ts">
  import BreathingExercise from '$lib/components/BreathingExercise.svelte';
  import GenderConstellationChart from '$lib/components/GenderConstellationChart.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import WrappedCard from '$lib/components/WrappedCard.svelte';

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
</div>
