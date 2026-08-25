<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import DimensionSlider from '$lib/components/DimensionSlider.svelte';

  let name = $state('');
  let low = $state('');
  let high = $state('');
  let max = $state(100);

  let previewDim = $derived({
    key: 'preview',
    name: name || m.cd_preview_name(),
    low: low || m.cd_preview_low(),
    high: high || m.cd_preview_high(),
    min: 0,
    max,
    builtIn: false,
    hidden: false,
  });

  /* Add the scale, then tick it, which is what makes it appear in the
     editor. It used to take three writes: a dimension, a custom preset
     holding the active preset's scales plus the new one, and a switch to
     that preset - all because the stored choice was a preset and a preset
     had to exist for a scale to be in one. Ticket 35 made the stored choice
     the list itself, so the second and third writes have nothing left to
     do. */
  async function saveDimension() {
    const created = await journal.dimensions.addCustomDimension({
      name: name.trim() || m.cd_default_name(),
      low: low.trim() || m.cd_default_low(),
      high: high.trim() || m.cd_default_high(),
      min: 0,
      max,
    });
    prefs.activeScales = [...prefs.activeScales, created.key];
    goto('/settings');
    toast(m.cd_added_toast());
  }
</script>

<div class="screen">
  <ScreenHeader title={m.custom_dimension()} back="/settings" subtitle={m.cd_intro()} />

  <div class="card editor-section">
    <div class="field">
      <label class="field-label" for="cd-name">{m.cd_name_label()}</label>
      <input class="input" id="cd-name" name="cd-name" placeholder={m.cd_name_placeholder()} bind:value={name} />
    </div>
    <div class="cd-endpoints">
      <div class="field">
        <label class="field-label" for="cd-low">{m.cd_low_label()}</label>
        <input class="input" id="cd-low" name="cd-low" placeholder={m.cd_low_placeholder()} bind:value={low} />
      </div>
      <div class="field">
        <label class="field-label" for="cd-high">{m.cd_high_label()}</label>
        <input class="input" id="cd-high" name="cd-high" placeholder={m.cd_high_placeholder()} bind:value={high} />
      </div>
    </div>
    <div class="field">
      <span class="field-label">{m.cd_range_label()}</span>
      <Segmented
        name={m.cd_range_label()}
        options={[
          { value: '10', label: '0–10' },
          { value: '100', label: '0–100' },
        ]}
        value={String(max)}
        onChange={(v) => (max = Number(v))}
      />
    </div>
  </div>

  <div class="card editor-section">
    <h2 class="editor-heading">{m.cd_preview()}</h2>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.cd_preview_note()}</p>
    {#key `${previewDim.name}|${previewDim.low}|${previewDim.high}|${max}`}
      <DimensionSlider dim={previewDim} value={Math.round(max * 0.6)} onInput={() => {}} />
    {/key}
  </div>

  <div class="editor-savebar">
    <button class="btn btn-primary" data-save onclick={saveDimension}>
      <Icon name="check" size={20} /><span>{m.cd_save()}</span>
    </button>
  </div>
</div>
