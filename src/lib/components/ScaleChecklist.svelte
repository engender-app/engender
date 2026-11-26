<script lang="ts">
  /* Onboarding and Settings share individual scale choices. Each subtitle
     explains what its scale measures. The full-width
     list uses a press wash (tier 1). An empty selection is valid, so let
     people untick every row and continue without a warning. */

  import { m } from '$lib/paraglide/messages';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { GenderDimension } from '$lib/data/types';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';

  let {
    ticked,
    onToggle,
    addHref,
    offered
  }: {
    /** Dimension keys, in any order - the list draws the catalogue's. */
    ticked: string[];
    onToggle: (key: string) => void;
    /** Where "add your own scale" goes, on the screens that can afford to
        send somebody there. The first run cannot: leaving mid-flow would
        drop it, so onboarding passes nothing and the row does not render. */
    addHref?: string;
    /** The scales to draw instead of the vocabulary's: the first run, which
        has no journal to fill the vocabulary from yet. */
    offered?: GenderDimension[];
  } = $props();

  /* Every scale that is not hidden, plus any hidden one still ticked. This
     list has to offer exactly what the editor can draw, and
     `reference.activeDimensions` does not filter on hidden, so a ticked
     scale must stay here to be unticked even if an archive or an older
     build hid it. Hiding a scale on the custom-scales screen unticks it in
     the same step, so a scale hidden there
     simply leaves this list until it is shown again.

     A row this list has drawn stays for as long as the list is mounted, so
     unticking a hidden scale here leaves its row in place, unticked, rather
     than taking it out from under the finger in one frame. `drawn` is a
     plain Set on purpose: it only remembers, and nothing should re-run
     because it grew. */
  const drawn = new Set<string>();
  let scales = $derived.by(() => {
    if (offered) return offered;
    const list = vocabulary.dimensions.filter((d) => !d.hidden || ticked.includes(d.key) || drawn.has(d.key));
    for (const d of list) drawn.add(d.key);
    return list;
  });
  let isTicked = $derived((key: string) => ticked.includes(key));
</script>

<ListCard>
  {#each scales as scale (scale.key)}
    <ListRow
      key={`scale-${scale.key}`}
      title={scale.name}
      subtitle={vocabulary.dimensionNote(scale)}
      checked={isTicked(scale.key)}
      chevron={false}
      onclick={() => onToggle(scale.key)}
    />
  {/each}
  {#if addHref}
    <!-- Keyed outside the `scale-` family on purpose: it is a way off this
         screen, not a scale, and a handle that reads as one puts it in
         every locator that counts the scales. -->
    <ListRow key="add-custom-scale" icon="plus" title={m.add_custom()} href={addHref} />
  {/if}
</ListCard>
