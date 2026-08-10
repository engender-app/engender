<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { addCustomDimension } from '$lib/data/repositories/dimensions';
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
    name: name || 'Your dimension',
    low: low || 'left end',
    high: high || 'right end',
    min: 0,
    max,
    builtIn: false,
  });

  function saveDimension() {
    addCustomDimension({
      key: 'custom_' + Date.now(),
      name: name.trim() || 'My dimension',
      low: low.trim() || 'low',
      high: high.trim() || 'high',
      min: 0,
      max,
    });
    goto('/settings');
    toast('Dimension added to a new custom preset.');
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.custom_dimension()}</h1>
    <div class="header-action"></div>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">
    Track anything the built-in scales miss. You choose the words for both ends.
  </p>

  <div class="card editor-section">
    <div class="field">
      <label class="field-label" for="cd-name">Name</label>
      <input class="input" id="cd-name" name="cd-name" placeholder="e.g. Voice comfort" bind:value={name} />
    </div>
    <div class="cd-endpoints">
      <div class="field">
        <label class="field-label" for="cd-low">Left endpoint</label>
        <input class="input" id="cd-low" name="cd-low" placeholder="e.g. strained" bind:value={low} />
      </div>
      <div class="field">
        <label class="field-label" for="cd-high">Right endpoint</label>
        <input class="input" id="cd-high" name="cd-high" placeholder="e.g. natural" bind:value={high} />
      </div>
    </div>
    <div class="field">
      <span class="field-label">Range</span>
      <Segmented
        name="Range"
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
    <h2 class="editor-heading">Preview</h2>
    <p class="muted small" style="margin-bottom:var(--space-3)">This is how it will look on the entry screen.</p>
    {#key `${previewDim.name}|${previewDim.low}|${previewDim.high}|${max}`}
      <DimensionSlider dim={previewDim} value={Math.round(max * 0.6)} onInput={() => {}} />
    {/key}
  </div>

  <div class="editor-savebar">
    <button class="btn btn-primary" data-save onclick={saveDimension}>
      <Icon name="check" size={20} /><span>Add dimension</span>
    </button>
  </div>
</div>
