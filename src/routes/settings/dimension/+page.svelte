<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { reference } from '$lib/data/live/reference.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
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

  /* Adding a dimension spawns a custom preset extending the active one and
     switches to it, which is what makes the new scale appear in the editor.
     Three writes rather than one - the journal keeps presets and dimensions
     separate, because a preset is also creatable without a new dimension. */
  async function saveDimension() {
    const created = await journal.dimensions.addCustomDimension({
      name: name.trim() || m.cd_default_name(),
      low: low.trim() || m.cd_default_low(),
      high: high.trim() || m.cd_default_high(),
      min: 0,
      max,
    });
    const preset = await journal.dimensions.addPreset({
      name: m.cd_preset_name(),
      dims: [...reference.activePreset.dims, created.key],
    });
    prefs.activePreset = preset.id;
    goto('/settings');
    toast(m.cd_added_toast());
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.custom_dimension()}</h1>
    <div class="header-action"></div>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.cd_intro()}</p>

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
