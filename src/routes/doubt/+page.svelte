<script lang="ts">
  /* Safe space opens on the breathing exercise with the same choices from Today, the hub or
     an Android launch. Link personal support above the breath so it is reachable without
     starting the exercise.

     The breath renders before SQLite answers. A bounded pool read decides whether to offer
     Good moments, which stays absent until the read finds something. Each destination owns
     its full reads. */
  import { m } from '$lib/paraglide/messages';
  import BreathingExercise from '$lib/components/BreathingExercise.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import { SAFE_SPACE_WAYS, type SafeSpaceWayKey } from '$lib/data/safeSpaceWays';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { calmRole, roleAt } from '$lib/theme/roles';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { EUPHORIA_TAG_KEYS } from '$lib/data/vocabulary/builtinTemplates';
  import { disclose } from '$lib/motion/reveal';
  import { navigating } from '$app/state';

  const evidenceQuery = liveList((j) => j.entries.counterevidencePool(EUPHORIA_TAG_KEYS, 1));

  /* The words for each way, beside the list rather than in it: the order is a fact about
     the product and lives in the module. */
  const WAY_COPY: Record<SafeSpaceWayKey, { title: () => string; sub?: () => string }> = {
    resources: { title: m.resources_title },
    evidence: { title: m.safe_space_counterevidence_title, sub: m.safe_space_evidence_sub }
  };
</script>

<div class="screen screen-safe-space">
  <ScreenHeader title={m.safe_space_title()} back="/more" screen="safe-space" />

  <a class="btn btn-soft btn-block" href="/doubt/comfort">{m.comfort_list_title()}</a>

  <div class="breath-stage">
    <BreathingExercise role={calmRole(activeFlag.roles)} />
  </div>

  <ListCard role={roleAt(activeFlag.roles, 1)}>
    {#each SAFE_SPACE_WAYS as way, i (way.key)}
      {#if way.key !== 'evidence' || evidenceQuery.rows.length}
        <div class="rows-divide" transition:disclose={{ skip: way.key !== 'evidence' || navigating.to !== null }}>
          <ListRow
            key={way.key}
            icon={way.icon}
            href={way.href}
            title={WAY_COPY[way.key].title()}
            subtitle={WAY_COPY[way.key].sub?.()}
            style="--row-index:{i}"
          />
        </div>
      {/if}
    {/each}
  </ListCard>
</div>

<style>
  /* A column, so the breath can take the free height on a phone and the
     ways down sit under it rather than floating in the middle of a screen
     with nothing else on it. `.screen` is already min-height:100% of the
     scroll region, so "free" here is the window minus the field and the
     list. */
  .screen-safe-space {
    display: flex;
    flex-direction: column;
  }

  /* Centre the breath in the remaining space and preserve the
     272px ring, description and control. Short screens scroll.
     Enter from 94% over --dur-authored. Fill both ways so
     the 1ms reduced-motion clamp still lands at rest.

     Animate the wrapper. Transforming the button would override
     press.css's :active transform. */
  .breath-stage {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: min-content;
    animation: breath-arrive var(--dur-authored) var(--ease-out) both;
  }

  @keyframes breath-arrive {
    from { opacity: 0; transform: scale(0.94); }
    to { opacity: 1; transform: scale(1); }
  }

  /* Icon blocks clip from the left over --dur-slow, staggered per row.
     Text cuts. Start --dur-fast after the breath begins so the last row
     settles around 730ms. Waiting for the full breath took 1305ms in the
     trace. Use :global to reach ListRow's icon square. */
  .screen-safe-space :global(.kit-row-ico) {
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--dur-fast) + var(--row-index, 0) * var(--stagger-step));
  }
</style>
