<script lang="ts">
  /* The person's own comfort band (phase 8 features ticket 09, ADR-0059).

     A different object from the reference bands, and both belong on the
     figure. The reference bands are a citation: two published ranges and
     the region where they coincide, drawn the same weight as each other so
     none of them is a target. This one is a decision, and the app has
     nothing to say about it - no default, no suggestion, no table of what
     somebody's comfortable range ought to be for their height or their age
     or how long they have been at it. Two numbers, typed in, cleared as
     easily as set.

     Which is why it ships empty and stays empty until somebody fills it in.
     A default here would be the norm table the whole rule exists to keep
     out, wearing the person's own name.

     The pair is validated in audio/bands.ts (`comfortBand`) rather than
     here: two ends the wrong way round are read the way they were meant,
     and a number no voice reaches is refused. This screen only ever writes
     a pair that came back from it. */
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
    subtitle={band ? m.vb_comfort_value({ low: band.lowHz, high: band.highHz }) : m.vb_comfort_none()}
  >
    {#snippet leading()}<span class="kit-row-ico"><Icon name="ruler" size={20} /></span>{/snippet}
  </ListRow>
</ListCard>

<Sheet
  open={editing}
  title={band ? m.vb_comfort_edit() : m.vb_comfort_set()}
  onClose={() => (editing = false)}
>
  <p class="muted small">{m.vb_comfort_hint()}</p>
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
