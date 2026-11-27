<script lang="ts">
  import type { TransitionConfig } from 'svelte/transition';
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { tagIconOf, tagIconSvg } from './tagIcons';
  import { familyPicked, finerOf, tapFamily, toggleTag } from '$lib/data/vocabulary/emotionFamilies';
  import { disclose, resize } from '$lib/motion/reveal';
  import { pinnedOut } from '$lib/motion/narrow';
  import { crossfadeDuration, EASE_OUT, fadeOnly, isReducedMotion, motionDistance, motionDuration } from '$lib/motion/tokens';
  import type { Tag, TagGroup } from '$lib/data/types';

  let {
    groups,
    selected,
    emotionFamilies = false,
    onChange
  }: {
    groups: TagGroup[];
    selected: string[];
    emotionFamilies?: boolean;
    onChange: (next: string[]) => void;
  } = $props();

  // Only a dysphoria type tag carries a description (CONTEXT: Dysphoria
  // type), so this stays null for every chip that has no info affordance.
  let infoTag = $state<Tag | null>(null);

  /* The family whose finer words are open. A closed family shows a
     count when any of its finer words are picked. */
  let open = $state<string | null>(null);
  let switching = $state(false);

  /** A group's tags split for the families row: each family with the finer
      words of it this group shows, then every other tag. A finer word whose
      family is hidden has nothing to open it, so it stands as a plain pill. */
  function arrange(g: TagGroup) {
    const families: { tag: Tag; finer: Tag[] }[] = [];
    if (!emotionFamilies || g.key !== 'emotions') return { families, rest: g.tags };
    const filed = new Set<string>();
    for (const t of g.tags) {
      const finer = finerOf(t.id);
      if (finer.length === 0) continue;
      const words = g.tags.filter((tag) => finer.includes(tag.id));
      families.push({ tag: t, finer: words });
      for (const w of words) filed.add(w.id);
      filed.add(t.id);
    }
    return { families, rest: g.tags.filter((t) => !filed.has(t.id)) };
  }

  function toggle(id: string, finer: boolean) {
    const next = toggleTag(selected, id, finer);
    if (open && !familyPicked(next, open)) open = null;
    onChange(next);
  }

  function tapOn(family: string) {
    const next = tapFamily({ selected, open }, family);
    switching = open !== null && next.open !== null;
    open = next.open;
    if (next.selected !== selected) onChange(next.selected);
  }

  function trayMotion(node: Element): TransitionConfig {
    return isReducedMotion() ? fadeOnly(crossfadeDuration()) : disclose(node);
  }

  function wordsIn(_node: Element, { switching }: { switching: boolean }): TransitionConfig {
    const reduced = isReducedMotion();
    if (reduced && !switching) return { duration: 0 };
    const duration = reduced ? crossfadeDuration() : motionDuration('--dur-fast');
    const distance = reduced ? 0 : motionDistance('--motion-distance-sm');
    const outgoing = switching ? crossfadeDuration() : 0;
    const total = outgoing + duration;
    return {
      duration: total,
      css: (t) => {
        // Wait for the outgoing fade within the same frame clock.
        const progress = EASE_OUT(Math.max(0, (t * total - outgoing) / duration));
        return `opacity: ${progress};` + (reduced ? '' : `transform: translateY(${(1 - progress) * distance}px);`);
      }
    };
  }
</script>

{#snippet chip(t: Tag, finer = false)}
  <button
    class="tag-chip"
    class:is-selected={selected.includes(t.id)}
    aria-pressed={selected.includes(t.id)}
    data-tag={t.id}
    onclick={() => toggle(t.id, finer)}
  >
    {@html tagIconSvg(tagIconOf(t))}{t.label}
  </button>
{/snippet}

{#snippet pill(t: Tag)}
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
{/snippet}

{#snippet row(g: TagGroup)}
  {@const { families, rest } = arrange(g)}
  <!-- Wrapped chips on every surface: a new entry's step had one sideways row per group,
       item 90. -->
  <div class="tag-row" role="group" aria-label={m.tags_group_aria({ group: g.name })}>
    {#each families as f (f.tag.id)}
      {@const inside = f.finer.filter((w) => selected.includes(w.id)).length}
      {@const picked = f.finer.length > 0 ? familyPicked(selected, f.tag.id) : selected.includes(f.tag.id)}
      <button
        class="tag-chip"
        class:is-selected={picked}
        class:is-open={open === f.tag.id}
        aria-pressed={picked}
        aria-expanded={f.finer.length > 0 ? open === f.tag.id : undefined}
        aria-controls={open === f.tag.id ? `family-${g.key}` : undefined}
        data-tag={f.tag.id}
        data-family={f.tag.id}
        onclick={() => (f.finer.length > 0 ? tapOn(f.tag.id) : toggle(f.tag.id, false))}
      >
        {@html tagIconSvg(tagIconOf(f.tag))}{f.tag.label}{#if inside > 0}<span class="tag-count" aria-hidden="true">{inside}</span><span class="visually-hidden">{m.tag_family_picked_inside({ count: String(inside) })}</span>{/if}
        {#if f.finer.length > 0}
          <span class="family-chevron"><Icon name="chevronDown" size={14} /></span>
        {/if}
      </button>
    {/each}
    {#each rest as t (t.id)}
      {@render pill(t)}
    {/each}
  </div>
  {#if families.length > 0}
    {@const openFamily = families.find((f) => f.tag.id === open && f.finer.length > 0)}
    {#if openFamily}
      <div class="family-tray" id={`family-${g.key}`} transition:trayMotion>
        <div class="family-words-frame" use:resize>
          {#key openFamily.tag.id}
            <div
              class="tag-row family-words"
              role="group"
              aria-label={openFamily.tag.label}
              in:wordsIn|global={{ switching }}
              out:pinnedOut={{ opacityOnly: true }}
            >
              {#each openFamily.finer as t (t.id)}
                {@render chip(t, true)}
              {/each}
            </div>
          {/key}
        </div>
      </div>
    {/if}
  {/if}
{/snippet}

<div class="tag-picker">
  {#each groups as g (g.key)}
    <div class="tag-group" data-tag-group={g.key}>
      <span class="tag-group-name">{g.name}</span>
      {@render row(g)}
    </div>
  {/each}
</div>

<Sheet open={infoTag !== null} title={infoTag?.label ?? ''} onClose={() => (infoTag = null)}>
  {#if infoTag}
    <h3>{infoTag.label}</h3>
    <p class="muted small">{infoTag.description}</p>
  {/if}
</Sheet>

<style>
  /* The icon sits left of the label in the chip's own 5px gap, nudged a
     little into the padding so a chip with an icon is not wider at its
     left than one without by the whole icon. Muted until picked. */
  .tag-picker :global(.tag-chip .tag-icon) {
    flex: none;
    margin-left: -3px;
    color: var(--text-2);
    transition: color var(--dur-fast) var(--ease-out);
  }
  .tag-picker :global(.tag-chip.is-selected .tag-icon) {
    color: currentColor;
  }
  .family-chevron {
    display: inline-flex;
    flex: none;
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .tag-chip.is-open .family-chevron {
    transform: rotate(180deg);
  }
  .tag-count {
    margin-left: 1px;
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
    color: var(--text-2);
  }
  .tag-chip.is-selected .tag-count {
    color: currentColor;
  }

  /* One tray opens to its own height and resizes when its words change. */
  .family-tray {
    position: relative;
    margin-top: var(--space-3);
    border-radius: var(--r-block);
    border: 1px solid var(--outline);
    background: var(--surface-2);
  }
  .family-words-frame {
    position: relative;
  }
  .family-words {
    padding: var(--space-3);
  }
</style>
