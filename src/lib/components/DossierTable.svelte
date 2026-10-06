<script lang="ts">
  import type { Snippet } from 'svelte';
  import { crossfadeDuration, fadeOnly } from '$lib/motion/tokens';
  import Icon from './Icon.svelte';

  let { label, children }: { label: string; children: Snippet } = $props();
  let canScrollStart = $state(false);
  let canScrollEnd = $state(false);

  function fadeEdge(_node: Element) {
    return fadeOnly(crossfadeDuration());
  }

  function observeScroll(node: HTMLElement) {
    function measure() {
      canScrollStart = node.scrollLeft > 1;
      canScrollEnd = node.scrollLeft < node.scrollWidth - node.clientWidth - 1;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', measure);
    };
  }
</script>

<div class="dossier-table-frame">
  <!-- Horizontal scroll regions need focus so arrow keys can reach every column. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="dossier-table-wrap" role="region" aria-label={label} tabindex="0" {@attach observeScroll}>
    {@render children()}
  </div>
  {#if canScrollStart}
    <span class="dossier-edge dossier-edge-start no-print" aria-hidden="true" transition:fadeEdge><Icon name="chevronLeft" size={18} /></span>
  {/if}
  {#if canScrollEnd}
    <span class="dossier-edge dossier-edge-end no-print" aria-hidden="true" transition:fadeEdge><Icon name="chevronRight" size={18} /></span>
  {/if}
</div>

<style>
  .dossier-table-frame {
    position: relative;
  }

  /* The width the stacked rows in clinician-print.css answer to. Screen
     only, so paper lays its tables out exactly as it did. */
  @media screen {
    .dossier-table-frame {
      container: dossier-table / inline-size;
    }
  }

  .dossier-table-wrap:focus-visible {
    outline-offset: -2px;
  }

  .dossier-edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 32px;
    display: flex;
    align-items: center;
    color: var(--text-2);
    pointer-events: none;
  }

  .dossier-edge-start {
    left: 0;
    justify-content: flex-start;
    padding-left: var(--space-1);
    background: linear-gradient(to right, var(--bg) 22px, transparent);
  }

  .dossier-edge-end {
    right: 0;
    justify-content: flex-end;
    padding-right: var(--space-1);
    background: linear-gradient(to left, var(--bg) 22px, transparent);
  }
</style>
