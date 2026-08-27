<script lang="ts" generics="T">
  /* The three-state gate every screen waiting on a list used to hand-write:
     a placeholder, the rows, or the empty state (phase 5 audit ticket 04).

     Thirty-one screens carried the same `{#if loading}{:else if
     rows.length}{:else}` and the same `?? []` under it. The branch is here
     now, once, and a screen brings a read and two snippets. The rule it
     renders is readGate.ts, node-tested; this file is the rendering and
     holds nothing else, the split recordEditor.ts already makes in this
     directory.

     The fourth branch is optional and opt-in. A read that failed shows the
     empty state unless a screen passes `failed`, which keeps the rendering
     the reactive layer already chose - a placeholder held forever tells the
     user less than an empty state does, and an unreadable database is
     reported from boot. Two surfaces do pass it: the export and the import,
     where "you have nothing to export" and "we could not read what you
     have" send the user somewhere different.

     The skeleton's shape is the screen's, because it stands in for what that
     screen is about to draw - a chart is a block, a list of rows is lines.
     Its timing and its own shape are ticket 15's. */
  import type { Snippet } from 'svelte';
  import Skeleton from '../Skeleton.svelte';
  import { gateBranch } from './readGate';
  import type { LiveList } from '$lib/data/live/journal.svelte';
  import { crossfade } from '$lib/motion/reveal';

  let {
    read,
    variant = 'line',
    count = 3,
    rows,
    empty,
    failed
  }: {
    /** The read being waited on, from `liveList` (journal.svelte.ts). */
    read: LiveList<T>;
    /** The placeholder's shape, as Skeleton means it. */
    variant?: 'card' | 'block' | 'line';
    count?: number;
    /** What the screen draws when the read has rows. Handed them, so the
        screen does not read `read.rows` a second time. */
    rows: Snippet<[T[]]>;
    /** What the screen says when the read came back with nothing. */
    empty: Snippet;
    /** What the screen says when the read did not work. Omitted - which is
        the case on all but two surfaces - a failed read shows `empty`. */
    failed?: Snippet;
  } = $props();

  let branch = $derived(gateBranch(read, failed !== undefined));
</script>

{#if branch === 'loading'}
  <div out:crossfade><Skeleton {variant} {count} /></div>
{:else if branch === 'rows'}
  {@render rows(read.rows)}
{:else if branch === 'failed'}
  {@render failed?.()}
{:else}
  {@render empty()}
{/if}
