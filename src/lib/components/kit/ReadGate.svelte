<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import Notice from './Notice.svelte';
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
    /** What the screen draws when the read has rows.

        Handed them, so a snippet cannot render a different list than the one
        the gate branched on. Most screens take no parameter: they already
        hold a `$derived` of the same read for a count or a sheet elsewhere in
        the file, and a snippet may declare fewer parameters than it is
        offered. It is the screens with nothing but the list that take it. */
    rows: Snippet<[T[]]>;
    /** What the screen says when the read came back with nothing. */
    empty: Snippet;
    /** Optional domain-specific explanation; retry remains shared. */
    failed?: Snippet;
  } = $props();

  let branch = $derived(gateBranch(read));
</script>

{#if branch === 'loading'}
  <div out:crossfade><Skeleton {variant} {count} /></div>
{:else}
  {#if branch === 'failed' || branch === 'stale'}
    <div role="status">
      {#if branch === 'failed' && failed}
        {@render failed()}
      {/if}
      <Notice
        title={branch === 'stale' ? m.read_refresh_failed() : failed ? undefined : m.read_failed()}
        text={branch === 'stale' ? m.read_stale_body() : undefined}
        action={{ label: m.read_retry(), onclick: () => read.retry() }}
      />
    </div>
  {/if}
  {#if branch === 'rows' || (branch === 'stale' && read.rows.length > 0)}
    {@render rows(read.rows)}
  {:else if branch === 'empty'}
    {@render empty()}
  {/if}
{/if}
