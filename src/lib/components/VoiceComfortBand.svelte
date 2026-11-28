<script lang="ts">
  /* Optional comfort bracket. No default or suggested range; both ends
     are set and cleared together. */
  import { m } from '$lib/paraglide/messages';
  import { comfortBand } from '$lib/audio/bands';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import type { Role } from '$lib/theme/roles';

  let { role }: { role?: Role } = $props();

  let editing = $state(false);
  let lowDraft = $state('');
  let highDraft = $state('');

  let band = $derived(comfortBand(prefs.voiceComfortLowHz, prefs.voiceComfortHighHz));
  let draft = $derived(comfortBand(Number(lowDraft) || null, Number(highDraft) || null));

  function open() {
    lowDraft = prefs.voiceComfortLowHz === null ? '' : String(prefs.voiceComfortLowHz);
    highDraft = prefs.voiceComfortHighHz === null ? '' : String(prefs.voiceComfortHighHz);
    editing = true;
  }

  function save() {
    if (!draft) return;
    prefs.voiceComfortLowHz = draft.lowHz;
    prefs.voiceComfortHighHz = draft.highHz;
    editing = false;
  }

  /* Cleared together, the way they are set together: half a band is not a
     band, and the figure would have nothing to draw from one end. */
  function clear() {
    prefs.voiceComfortLowHz = null;
    prefs.voiceComfortHighHz = null;
    editing = false;
  }
</script>

<ListCard {role}>
  <ListRow
    data-comfort-band
    title={m.vb_comfort_heading()}
    onclick={open}
    subtitle={band ? m.hz_range({ low: band.lowHz, high: band.highHz }) : m.vb_comfort_none()}
  >
    {#snippet leading()}<span class="kit-row-ico"><Icon name="ruler" size={20} /></span>{/snippet}
  </ListRow>
</ListCard>

<Sheet
  open={editing}
  title={band ? m.vb_comfort_edit() : m.vb_comfort_set()}
  onClose={() => (editing = false)}
>
  <div class="cb-fields">
    <label class="field">
      <span class="field-label">{m.vb_comfort_low()}</span>
      <input
        class="input"
        data-comfort-low
        type="number"
        inputmode="numeric"
        min="60"
        max="500"
        bind:value={lowDraft}
      />
    </label>
    <label class="field">
      <span class="field-label">{m.vb_comfort_high()}</span>
      <input
        class="input"
        data-comfort-high
        type="number"
        inputmode="numeric"
        min="60"
        max="500"
        bind:value={highDraft}
      />
    </label>
  </div>
  <p class="muted small">{m.vb_comfort_range_hint()}</p>
  <div class="cb-actions">
    <button class="btn btn-primary" data-comfort-save disabled={!draft} onclick={save}>
      <span>{m.vb_comfort_save()}</span>
    </button>
    {#if band}
      <button class="btn btn-quiet" data-comfort-clear onclick={clear}>
        <span>{m.vb_comfort_clear()}</span>
      </button>
    {/if}
  </div>
</Sheet>

<style>
  .cb-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin: var(--space-4) 0 var(--space-3);
  }

  .cb-actions {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
</style>
