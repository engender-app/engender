<script lang="ts">
  import Icon from './Icon.svelte';
  import type { TagGroup } from '$lib/data/types';

  let {
    groups,
    selected,
    onToggle,
  }: { groups: TagGroup[]; selected: string[]; onToggle: (id: string) => void } = $props();
</script>

<div class="tag-picker">
  {#each groups as g (g.key)}
    <div class="tag-group">
      <span class="tag-group-name">{g.name}</span>
      <div class="tag-row" role="group" aria-label="{g.name} tags">
        {#each g.tags as t (t.id)}
          <button
            class="tag-chip"
            class:is-selected={selected.includes(t.id)}
            aria-pressed={selected.includes(t.id)}
            onclick={() => onToggle(t.id)}
          >
            {#if selected.includes(t.id)}<Icon name="check" size={14} />{/if}{t.label}
          </button>
        {/each}
      </div>
    </div>
  {/each}
</div>
