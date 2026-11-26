<script lang="ts">
  /* Wear, Voice and Journal share this presentation picker (ADR-0048).
     Choosing a mode highlights matching days (ADR-0030). The caller
     applies the selection and the vocabulary supplies visible modes. These
     chips share the entry editor's tag-pill styles.

     On a cold mount, ReadReserve holds 68px until vocabulary.ready and
     then fades in the chips or collapses to empty. A warm mount renders
     ready chips immediately. An empty wrapper still occupies a slot in
     Journal's grid gap, so settledEmpty unmounts it after --dur-med to
     let the collapse finish first. */
  import { m } from '$lib/paraglide/messages';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';
  import ReadReserve from './kit/ReadReserve.svelte';
  import { motionDuration } from '$lib/motion/tokens';

  let {
    value,
    onPick
  }: {
    /** The presentation currently highlighted, or `null` for "none" - the
        resting state a chart with no chip picked reads exactly as it did
        before this component existed. */
    value: string | null;
    onPick: (id: string | null) => void;
  } = $props();

  let presentations = $derived(vocabulary.visiblePresentations);

  /* One line of label plus one row of pills, measured on the demo persona
     at 66.5px - a little headroom over that. Unlike Home's fold (whose
     estimate is remembered per visit, homeReserve.ts), this row's height
     barely varies with what it turns out to hold, so a fixed guess is
     `resize`'d away in the rare case it is wrong rather than needing its
     own remembered height. */
  const ESTIMATE_PX = 68;

  let settledEmpty = $state(false);
  $effect(() => {
    if (!vocabulary.ready || presentations.length > 0) {
      settledEmpty = false;
      return;
    }
    const timer = setTimeout(() => (settledEmpty = true), motionDuration('--dur-med'));
    return () => clearTimeout(timer);
  });
</script>

{#if !settledEmpty}
  <ReadReserve ready={vocabulary.ready} estimate={ESTIMATE_PX} data-presentation-highlight-row>
    {#if presentations.length > 0}
      <div class="presentation-highlight">
        <span class="tag-group-name" id="presentation-highlight-label">
          {m.presentation_highlight_label()}
        </span>
        <!-- Toggles rather than radios (after-release 21, audit L05-08):
             pressing the chosen mode again clears the highlight, and a
             radio group is one that cannot be emptied. -->
        <div class="tag-row" role="group" aria-labelledby="presentation-highlight-label">
          {#each presentations as p (p.id)}
            {@const role = roleAt(activeFlag.roles, p.roleIndex)}
            <button
              type="button"
              class="tag-chip presentation-chip press"
              class:is-active={value === p.id}
              {...roleAttrs(role)}
              aria-pressed={value === p.id}
              data-presentation-highlight={p.id}
              onclick={() => onPick(value === p.id ? null : p.id)}
            >
              {p.name}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </ReadReserve>
{/if}
