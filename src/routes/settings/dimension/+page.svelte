<script lang="ts">
  import { journalTextAutocomplete } from '$lib/platform';
  import { replaceRoute } from '$lib/navigation/smart-back';
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { writer } from '$lib/stores/attempt.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import DimensionSlider from '$lib/components/DimensionSlider.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { crossfade, discloseWidth } from '$lib/motion/reveal';
  import { crossfadeDuration, fadeOnly } from '$lib/motion/tokens';
  import { attempt } from '$lib/stores/attempt.svelte';
  import type { GenderDimension } from '$lib/data/types';

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
  const saving = writer();
  async function saveDimension() {
    let created: { key: string } | undefined;
    const added = await saving.run(async () => {
      created = await journal.dimensions.addCustomDimension({
        name: name.trim() || m.cd_default_name(),
        low: low.trim() || m.cd_default_low(),
        high: high.trim() || m.cd_default_high(),
        min: 0,
        max,
      });
    }, m.write_failed());
    if (!added || !created) return;
    prefs.activeScales = [...prefs.activeScales, created.key];
    await replaceRoute('/settings');
    toast(m.cd_added_toast());
  }

  let customs = $derived(vocabulary.dimensions.filter((d) => !d.builtIn));

  /* A renamed scale's words cross: the old ones lift out and fade under
     (crossfade is out-only), the new ones fade up in place. Local, so it
     plays on a rename and not when the list itself arrives. */
  const nameIn = (_node: Element) => fadeOnly(crossfadeDuration());

  /* Latched: the mirror re-arms `ready` on a journal re-open, and a reserve
     must not put its placeholder back over a settled list. */
  let listRevealed = $state(false);
  $effect.pre(() => {
    if (vocabulary.ready) listRevealed = true;
  });
  const listEstimate = readReserve('custom-scales');
  const listRemember = (px: number) => rememberReserve('custom-scales', px);

  /* Hiding also unticks (CONTEXT: "Hidden" - out of every place a person
     picks), so a hidden scale is never drawn on the entry screen while the
     checklist that could untick it no longer lists it. Showing it again
     leaves it unticked: it comes back to the checklist, and ticking it is
     the person's own choice there. */
  function toggleHidden(d: GenderDimension) {
    const hide = !d.hidden;
    attempt(async () => {
      await journal.dimensions.setDimensionHidden(d.key, hide);
      if (hide && prefs.activeScales.includes(d.key)) {
        prefs.activeScales = prefs.activeScales.filter((k) => k !== d.key);
      }
    }, m.write_failed());
  }

  /* A custom scale's name and both ends, which are the person's own words.
     The range stays: values were logged on it. The sheet closes once the
     write lands and stays open with a toast when it does not. */
  let renameTarget = $state<{ key: string; name: string; low: string; high: string } | null>(null);
  const renaming = writer();
  async function rename() {
    const target = renameTarget;
    if (!target) return;
    const words = { name: target.name.trim(), low: target.low.trim(), high: target.high.trim() };
    if (!words.name || !words.low || !words.high) return;
    if (!(await renaming.run(() => journal.dimensions.renameCustomDimension(target.key, words), m.write_failed()))) return;
    renameTarget = null;
    toast(m.cd_renamed({ scale: words.name }));
  }
</script>

<div class="screen">
  <ScreenHeader title={m.custom_dimension()} back="/settings" subtitle={m.cd_intro()} />

  <!-- The scales already made, above the form that makes another
       (functional audit ticket 41): there was no way to correct a scale's
       wording or take one off the lists, only to add more. Gated on the
       vocabulary mirror and held at last visit's height, as the body-region
       screen's lists are, so a cold open does not cut them in. Nothing
       shows for somebody with no scales of their own. -->
  <ReadReserve ready={listRevealed} estimate={listEstimate} onrest={listRemember}>
    {#if customs.length > 0}
      <SectionHeading text={m.cd_yours_heading()} />
      <p class="muted small">{m.cd_hide_note()}</p>
      <div class="managed-tags" data-custom-scales>
        {#each customs as d (d.key)}
          <div class="rows-divide managed-tag" class:is-hidden={d.hidden}>
            <span class="managed-label scale-label" data-scale-label={d.key}>
              {#key d.name}<span in:nameIn out:crossfade>{d.name}</span>{/key}
            </span>
            {#if d.hidden}<span class="muted small" transition:discloseWidth>{m.cd_hidden()}</span>{/if}
            <span class="managed-actions">
              <button
                class="icon-btn"
                data-scale-rename={d.key}
                aria-label={m.cd_rename_aria({ scale: d.name })}
                onclick={() => (renameTarget = { key: d.key, name: d.name, low: d.low, high: d.high })}
              >
                <Icon name="pencil" size={16} />
              </button>
              <button
                class="icon-btn"
                data-scale-hide={d.key}
                aria-label={d.hidden ? m.cd_show_aria({ scale: d.name }) : m.cd_hide_aria({ scale: d.name })}
                onclick={() => toggleHidden(d)}
              >
                <Icon name={d.hidden ? 'eye' : 'eyeOff'} size={16} />
              </button>
            </span>
          </div>
        {/each}
      </div>
      <SectionHeading text={m.cd_new_heading()} />
    {/if}
  </ReadReserve>

  <Field label={m.cd_name_label()} id="cd-name">
    {#snippet children(id)}
      <input autocomplete={journalTextAutocomplete()} class="input" {id} name="cd-name" placeholder={m.cd_name_placeholder()} bind:value={name} />
    {/snippet}
  </Field>
  <div class="cd-endpoints">
    <Field label={m.cd_low_label()} id="cd-low">
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()} class="input" {id} name="cd-low" placeholder={m.cd_low_placeholder()} bind:value={low} />
      {/snippet}
    </Field>
    <Field label={m.cd_high_label()} id="cd-high">
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()} class="input" {id} name="cd-high" placeholder={m.cd_high_placeholder()} bind:value={high} />
      {/snippet}
    </Field>
  </div>
  <Field label={m.cd_range_label()} legend>
    {#snippet children()}
      <Segmented
        name={m.cd_range_label()}
        options={[
          { value: '10', label: '0–10' },
          { value: '100', label: '0–100' },
        ]}
        value={String(max)}
        onChange={(v) => (max = Number(v))}
      />
    {/snippet}
  </Field>

  <SectionHeading text={m.cd_preview()} />
  {#key `${previewDim.name}|${previewDim.low}|${previewDim.high}|${max}`}
    <DimensionSlider dim={previewDim} value={Math.round(max * 0.6)} onInput={() => {}} />
  {/key}

  <Sheet busy={renaming.busy} open={renameTarget !== null} title={m.cd_rename_sheet()} onClose={() => (renameTarget = null)}>
    {#if renameTarget}
      <h3>{m.cd_rename_sheet()}</h3>
      <Field label={m.cd_name_label()} id="rename-scale-name">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()} class="input" {id} name="rename-scale-name" bind:value={renameTarget!.name} />
        {/snippet}
      </Field>
      <div class="cd-endpoints">
        <Field label={m.cd_low_label()} id="rename-scale-low">
          {#snippet children(id)}
            <input autocomplete={journalTextAutocomplete()} class="input" {id} name="rename-scale-low" bind:value={renameTarget!.low} />
          {/snippet}
        </Field>
        <Field label={m.cd_high_label()} id="rename-scale-high">
          {#snippet children(id)}
            <input autocomplete={journalTextAutocomplete()} class="input" {id} name="rename-scale-high" bind:value={renameTarget!.high} />
          {/snippet}
        </Field>
      </div>
      <button
        class="btn btn-primary"
        data-save-scale-name
        disabled={!renameTarget.name.trim() || !renameTarget.low.trim() || !renameTarget.high.trim() || renaming.busy}
        onclick={rename}
      >
        <span>{m.cd_rename_save()}</span>
      </button>
    {/if}
  </Sheet>

  <SaveBar>
    <button class="btn btn-primary" data-save disabled={saving.busy} onclick={saveDimension}>
      <Icon name="check" size={20} /><span>{m.cd_save()}</span>
    </button>
  </SaveBar>
</div>

<style>
  /* The old name leaves out of flow (crossfade) while the new one is
     already there, so the label holds both for the length of the fade. */
  .scale-label {
    position: relative;
  }
</style>
