<script lang="ts">
  /* The wrapped share card (ticket 18), reached from a share button on
     /wrapped/[cadence] once a real wrapped is showing there. Everything on
     the card is chosen here, per element, before anything is generated -
     ticket 16's WrappedCardContent has no field for a journal entry's text
     or a photo, so there is nothing to opt back in even by accident.

     Generating and sharing are two presses rather than one: the image
     shown after "Make card" is the literal file the share sheet would get,
     rasterized from the live preview above it (wrappedCardImage.ts), so a
     person sees exactly what would leave the device before anything does.
     Changing a toggle after generating drops the preview and goes back to
     the live card, the same rule the photo journey export applies to its
     own range picker - a stale preview must never outlive the selection it
     was made from. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { WRAPPED_ENTRY_FLOOR, completedWrappedPeriod, WRAPPED_CADENCES, type WrappedCadence } from '$lib/data/wrapped';
  import {
    wrappedShareContent,
    wrappedShareFileName,
    WRAPPED_SHARE_NOTHING_SELECTED,
    type WrappedShareSelection
  } from '$lib/data/wrappedShare';
  import { renderWrappedCardImage } from '$lib/data/wrappedCardImage';
  import { deliverBlob } from '$lib/data/archive/deliver';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import WrappedCard from '$lib/components/WrappedCard.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const today = todayEpochDay();

  let cadence = $derived(
    (WRAPPED_CADENCES as readonly string[]).includes(page.params.cadence ?? '')
      ? (page.params.cadence as WrappedCadence)
      : null
  );
  let period = $derived(cadence ? completedWrappedPeriod(cadence, today) : null);

  let recapQuery = liveQuery(['entry', 'tag', 'milestone', 'dimension', 'photo'], (j) =>
    period ? j.stats.recap(period.start, period.end) : Promise.resolve(null)
  );
  let recap = $derived(recapQuery.value);
  let ready = $derived(prefs.wrappedEnabled && recap && recap.entryCount >= WRAPPED_ENTRY_FLOOR);

  let selection = $state<WrappedShareSelection>({ ...WRAPPED_SHARE_NOTHING_SELECTED });
  let nothingPicked = $derived(!selection.counts && !selection.streak && !selection.paletteArt);
  let content = $derived(
    recap
      ? wrappedShareContent(
          selection,
          { label: m.wrapped_stat_entries(), value: String(recap.entryCount) },
          { label: m.wrapped_stat_streak(), value: m.n_days({ n: recap.bestStreak }) }
        )
      : { stats: [], paletteArt: false }
  );

  let cardHost = $state<HTMLElement | null>(null);
  let running = $state(false);
  let made = $state.raw<{ blob: Blob; from: string } | null>(null);
  let previewUrl = $state<string | null>(null);

  let recipe = $derived(JSON.stringify(selection));
  let showing = $derived(made && made.from === recipe ? made : null);

  $effect(() => {
    const blob = showing?.blob;
    if (!blob) {
      previewUrl = null;
      return;
    }
    const url = URL.createObjectURL(blob);
    previewUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  async function make() {
    const cardNode = cardHost?.querySelector('[data-wrapped-card]') as HTMLElement | null;
    if (!cardNode) return;
    const from = recipe;
    running = true;
    try {
      const blob = await renderWrappedCardImage(cardNode);
      made = { blob, from };
    } catch (error) {
      console.error('rendering the wrapped share card failed', error);
      toast(m.pj_failed());
    } finally {
      running = false;
    }
  }

  /* The only thing on this screen that sends anything anywhere, and it goes
     through the same share sheet every other export uses (deliver.ts). */
  async function share() {
    if (!showing) return;
    try {
      const delivery = await deliverBlob(wrappedShareFileName(prefs.name), showing.blob);
      if (delivery === 'cancelled') {
        toast(m.exp_cancelled());
        return;
      }
      toast(delivery === 'shared' ? m.pj_shared() : m.pj_downloaded());
    } catch (error) {
      console.error('sharing the wrapped share card failed', error);
      toast(m.pj_failed());
    }
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/wrapped/{page.params.cadence}" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.wrapped_share_title()}</h1>
    <div class="header-action"></div>
  </header>

  {#if recapQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if !ready}
    <div class="notice notice-info" role="status">
      <Icon name="info" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.wrapped_unknown_title()}</span>
        {m.wrapped_unknown_body()}
      </div>
    </div>
  {:else}
    <div class="card">
      <span class="row-title" style="display:block;margin-bottom:var(--space-3)">{m.wrapped_share_picker_title()}</span>
      <div class="pref-row">
        <span class="row-text"><span class="row-title">{m.wrapped_stat_entries()}</span></span>
        <Switch
          checked={selection.counts}
          label={m.wrapped_stat_entries()}
          onChange={(v) => (selection = { ...selection, counts: v })}
        />
      </div>
      <div class="pref-row">
        <span class="row-text"><span class="row-title">{m.wrapped_stat_streak()}</span></span>
        <Switch
          checked={selection.streak}
          label={m.wrapped_stat_streak()}
          onChange={(v) => (selection = { ...selection, streak: v })}
        />
      </div>
      <div class="pref-row">
        <span class="row-text"><span class="row-title">{m.wrapped_share_element_palette()}</span></span>
        <Switch
          checked={selection.paletteArt}
          label={m.wrapped_share_element_palette()}
          onChange={(v) => (selection = { ...selection, paletteArt: v })}
        />
      </div>
    </div>

    {#if previewUrl && showing}
      <div class="card" style="margin-top:var(--space-4)">
        <img
          src={previewUrl}
          alt={m.wrapped_share_preview_alt()}
          style="display:block;width:100%;height:auto;border-radius:var(--radius-md)"
        />
        <p class="muted small" style="margin-top:var(--space-3)">{m.pj_stays_here()}</p>
        <div class="journey-actions" style="display:flex;gap:var(--space-3);margin-top:var(--space-3)">
          <button class="btn btn-primary" data-share onclick={share}>
            <Icon name="share" size={20} /><span>{m.pj_share()}</span>
          </button>
          <button class="btn btn-soft" data-again onclick={() => (made = null)}>
            <span>{m.pj_again()}</span>
          </button>
        </div>
      </div>
    {:else}
      <div style="margin-top:var(--space-4)" bind:this={cardHost}>
        <WrappedCard {content} />
      </div>
      <div class="editor-savebar" style="margin-top:var(--space-4)">
        <button class="btn btn-primary" data-generate disabled={running || nothingPicked} onclick={make}>
          <span>{m.pj_generate()}</span>
        </button>
      </div>
      {#if nothingPicked}
        <p class="muted small" style="margin-top:var(--space-3)">{m.wrapped_share_none_selected()}</p>
      {/if}
    {/if}
  {/if}
</div>
