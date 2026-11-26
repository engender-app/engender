<script lang="ts">
  import type { TransitionConfig } from 'svelte/transition';
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { tagIconOf, tagIconSvg } from './tagIcons';
  import { finerOf, tapFamily, toggleTag } from '$lib/data/vocabulary/emotionFamilies';
  import { EMOTION_FAMILIES } from '$lib/data/vocabulary/builtins';
  import { disclose, resize } from '$lib/motion/reveal';
  import { pinnedOut } from '$lib/motion/narrow';
  import { motionDuration } from '$lib/motion/tokens';
  import type { Tag, TagGroup } from '$lib/data/types';

  let {
    groups,
    selected,
    onChange
  }: {
    groups: TagGroup[];
    selected: string[];
    onChange: (next: string[]) => void;
  } = $props();

  // Only a dysphoria type tag carries a description (CONTEXT: Dysphoria
  // type), so this stays null for every chip that has no info affordance.
  let infoTag = $state<Tag | null>(null);

  const FAMILY_ORDER: readonly string[] = EMOTION_FAMILIES.map((f) => f.key);

  /* Emotion families (pre-release-human 22): the one family whose finer
     words show under the emotions row, or none. One at a time keeps the
     step short; a closed family with finer picks says so with a count. */
  let open = $state<string | null>(null);

  /** A group's tags split for the families row: each family with the finer
      words of it this group shows, then every other tag. A finer word whose
      family is hidden has nothing to open it, so it stands as a plain pill. */
  function arrange(g: TagGroup) {
    const shown = new Map(g.tags.map((t) => [t.id, t]));
    const families: { tag: Tag; finer: Tag[] }[] = [];
    const filed = new Set<string>();
    for (const t of g.tags) {
      const finer = finerOf(t.id);
      if (finer.length === 0) continue;
      const words = finer.flatMap((id) => shown.get(id) ?? []);
      families.push({ tag: t, finer: words });
      for (const w of words) filed.add(w.id);
      filed.add(t.id);
    }
    /* The families' own order, not the group's: a journal that predates
       `e-angry` holds it after the phase 1 six, where reconcile appended it. */
    families.sort((a, b) => FAMILY_ORDER.indexOf(a.tag.id) - FAMILY_ORDER.indexOf(b.tag.id));
    return { families, rest: g.tags.filter((t) => !filed.has(t.id)) };
  }

  const toggle = (id: string) => onChange(toggleTag(selected, id));
  const tapOn = (family: string) => {
    const next = tapFamily({ selected, open }, family);
    open = next.open;
    if (next.selected !== selected) onChange(next.selected);
  };

  /** A finer word arriving: it fades and rises into place, each a beat
      after the one before. motionDuration is 0 under reduced motion, the
      instant cut tier 3 owes that setting. */
  function wordIn(_node: Element, { index }: { index: number }): TransitionConfig {
    const duration = motionDuration('--dur-fast');
    return {
      duration,
      delay: duration === 0 ? 0 : 40 + index * 28,
      css: (t) => `opacity: ${t}; transform: translateY(${(1 - t) * 6}px);`
    };
  }
</script>

{#snippet chip(t: Tag)}
  <button
    class="tag-chip"
    class:is-selected={selected.includes(t.id)}
    aria-pressed={selected.includes(t.id)}
    data-tag={t.id}
    onclick={() => toggle(t.id)}
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
  <!-- Wrapped chips on every surface: a new entry's step had one sideways
       row per group (ticket 09) until bug session 18, item 90. -->
  <div class="tag-row" role="group" aria-label={m.tags_group_aria({ group: g.name })}>
    {#each families as f (f.tag.id)}
      {@const inside = f.finer.filter((w) => selected.includes(w.id)).length}
      <button
        class="tag-chip"
        class:is-selected={selected.includes(f.tag.id)}
        class:is-open={open === f.tag.id}
        aria-pressed={selected.includes(f.tag.id)}
        aria-expanded={f.finer.length > 0 ? open === f.tag.id : undefined}
        aria-controls={open === f.tag.id ? `family-${g.key}` : undefined}
        data-tag={f.tag.id}
        data-family={f.tag.id}
        onclick={() => (f.finer.length > 0 ? tapOn(f.tag.id) : toggle(f.tag.id))}
      >
        {@html tagIconSvg(tagIconOf(f.tag))}{f.tag.label}{#if inside > 0}<span class="tag-count" aria-hidden="true">{inside}</span><span class="visually-hidden">{m.tag_family_picked_inside({ count: String(inside) })}</span>{/if}
      </button>
    {/each}
    {#each rest as t (t.id)}
      {@render pill(t)}
    {/each}
  </div>
  {#if families.length > 0}
    {@const openFamily = families.find((f) => f.tag.id === open && f.finer.length > 0)}
    {#if openFamily}
      <div class="family-tray" id={`family-${g.key}`} transition:disclose>
        <div class="family-words-frame" use:resize>
          {#key openFamily.tag.id}
            <div class="tag-row family-words" role="group" aria-label={openFamily.tag.label} out:pinnedOut>
              {#each openFamily.finer as t, index (t.id)}
                <span class="family-word" in:wordIn|global={{ index }}>{@render chip(t)}</span>
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
  .tag-chip.is-open {
    border-color: var(--accent);
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

  /* The finer words' tray: one surface under the row that opens its own
     height (disclose) and keeps that one box while a different family's
     words replace these (resize). Which family it belongs to is the chip
     with the accent edge: a pointer under it named whichever chip stood
     above it once the families wrapped to two rows. */
  .family-tray {
    position: relative;
    margin-top: var(--space-3);
    border-radius: 18px;
    background: var(--surface-2);
  }
  .family-words-frame {
    position: relative;
  }
  .family-words {
    padding: var(--space-3);
  }
  .family-word {
    display: inline-flex;
  }
</style>
