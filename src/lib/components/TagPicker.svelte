<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import type { Tag, TagGroup } from '$lib/data/types';
  import { scrollCues } from './scrollCues';
  import { untrack } from 'svelte';

  let {
    groups,
    selected,
    onToggle,
    rows = false,
  }: {
    groups: TagGroup[];
    selected: string[];
    onToggle: (id: string) => void;
    /** One sideways row per group rather than wrapped chips: a new entry's
        step (ticket 09), where 28 default chips wrapped at the 48px touch
        pitch took about 590px of a 640px window. */
    rows?: boolean;
  } = $props();

  /* A row comes back to its first pick (ticket 09): a tag picked far along a
     sideways row was off the edge when the person walked back to the step,
     with nothing saying it was there. Set as the row mounts, before it is
     painted, so the row arrives already showing the pick rather than
     travelling to it. */
  function toFirstPick(row: HTMLElement) {
    const pick = row.querySelector<HTMLElement>('.tag-chip.is-selected');
    if (!pick) return;
    const edge = parseFloat(getComputedStyle(row).paddingInlineStart) || 0;
    const box = row.getBoundingClientRect();
    const at = pick.getBoundingClientRect();
    if (at.right <= box.right - edge) return;
    row.scrollLeft += at.left - box.left - edge;
  }

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

{#snippet row(g: TagGroup)}
  <div class="tag-row" role="group" aria-label={m.tags_group_aria({ group: g.name })} {@attach (node) => { if (rows) untrack(() => toFirstPick(node)); }}>
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
{/snippet}

<div class="tag-picker" class:is-rows={rows}>
  {#each groups as g (g.key)}
    <div class="tag-group" data-tag-group={g.key}>
      <span class="tag-group-name">{g.name}</span>
      {#if rows}
        <!-- The frame holds the fades at the row's two ends, which do not
             scroll with it; scrollCues says which end has more. -->
        <div class="tag-row-frame" use:scrollCues={{ axis: 'x' }}>
          {@render row(g)}
        </div>
      {:else}
        {@render row(g)}
      {/if}
    </div>
  {/each}
</div>

<Sheet open={infoTag !== null} title={infoTag?.label ?? ''} onClose={() => (infoTag = null)}>
  {#if infoTag}
    <h3>{infoTag.label}</h3>
    <p class="muted small">{infoTag.description}</p>
  {/if}
</Sheet>
