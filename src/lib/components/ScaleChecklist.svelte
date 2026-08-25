<script lang="ts">
  /* Which scales the entry screen offers, as a list you tick (phase 5
     ticket 35).

     One list, built once, on both the first run and Settings. Two copies of
     this is how the flag picker ended up with a cramped four-across grid on
     one screen and a readable two-across on the other, and the two surfaces
     this replaces had already drifted the same way: eight cards with chips
     on one, eight rows with a comma list on the other.

     What it replaced was a preset - one of eight subsets of five scales,
     picked by name. There are 32 subsets of five, so choosing meant finding
     the one that was wrong in the fewest places and then going and editing
     it, and the names ("Agender axis", "Partly masculine") described a
     person rather than a set of sliders. A list of scales describes the
     sliders, which is the only thing the app is actually asking about.

     Every row carries a line saying what its scale measures, because
     "Binary <-> nonbinary" is not self-explanatory to somebody twenty
     minutes into this app, and this is the second screen they ever see.
     Subtitles are earned rather than standard (DIRECTION.md 3b); a name
     that needs explaining is what earns one.

     A list card rather than the free-standing outlined cards the first run
     drew: onboarding's lock step is already a list card, so the setup
     screen has the surface, and a full-width row answers a press with its
     wash instead of scaling the card it sits in (DIRECTION.md tier 1).

     Nothing ticked is a resting state and this never says otherwise: no
     warning, no disabled Continue, no row that cannot be unticked. */

  import { m } from '$lib/paraglide/messages';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';

  let {
    ticked,
    onToggle,
    addHref
  }: {
    /** Dimension keys, in any order - the list draws the catalogue's. */
    ticked: string[];
    onToggle: (key: string) => void;
    /** Where "add your own scale" goes, on the screens that can afford to
        send somebody there. The first run cannot: leaving mid-flow would
        drop it, so onboarding passes nothing and the row does not render. */
    addHref?: string;
  } = $props();

  /* Every scale, not `visibleDimensions`. This list has to offer exactly
     what the editor can draw, and `reference.activeDimensions` does not
     filter on hidden - so filtering here would let a scale be ticked, drawn
     on every entry screen, and absent from the only list that could untick
     it. Nothing can set that flag on a dimension today anyway: no screen
     calls `setDimensionHidden`, so the only way one arrives is an archive
     from a build that had such a screen. If hiding a scale ever ships, it
     is that ticket's job to decide whether hiding also unticks - and those
     two answers have to be decided together, which is the argument for not
     guessing at half of it here. */
  let scales = $derived(vocabulary.dimensions);
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
    <ListRow key="add-custom-scale" icon="plus" title={m.add_custom()} subtitle={m.add_custom_sub()} href={addHref} />
  {/if}
</ListCard>
