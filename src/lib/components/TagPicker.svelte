<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import type { Tag, TagGroup } from '$lib/data/types';

  let {
    groups,
    selected,
    onToggle,
  }: { groups: TagGroup[]; selected: string[]; onToggle: (id: string) => void } = $props();

  // Only a dysphoria type tag carries a description (CONTEXT: Dysphoria
  // type), so this stays null for every chip that has no info affordance.
  let infoTag = $state<Tag | null>(null);
</script>

{#snippet chip(t: Tag)}
  <button
    class="tag-chip"
    class:is-selected={selected.includes(t.id)}
    aria-pressed={selected.includes(t.id)}
    data-tag={t.id}
    onclick={() => onToggle(t.id)}
  >
    {t.label}
  </button>
{/snippet}

<div class="tag-picker">
  {#each groups as g (g.key)}
    <div class="tag-group" data-tag-group={g.key}>
      <span class="tag-group-name">{g.name}</span>
      <div class="tag-row" role="group" aria-label={m.tags_group_aria({ group: g.name })}>
        {#each g.tags as t (t.id)}
          {#if t.description}
            <span class="tag-chip-wrap">
              {@render chip(t)}
              <button class="icon-btn tag-info-btn" data-tag-info={t.id} aria-label={m.tag_info_aria({ label: t.label })} onclick={() => (infoTag = t)}>
                <Icon name="info" size={14} />
              </button>
            </span>
          {:else}
            {@render chip(t)}
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>

<Sheet open={infoTag !== null} title={infoTag?.label ?? ''} onClose={() => (infoTag = null)}>
  {#if infoTag}
    <h3>{infoTag.label}</h3>
    <p class="muted small">{infoTag.description}</p>
  {/if}
</Sheet>
