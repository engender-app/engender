<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  let builtIns = $derived(vocabulary.bodyRegions.filter((r) => r.builtIn));
  let customs = $derived(vocabulary.bodyRegions.filter((r) => !r.builtIn));

  let addOpen = $state(false);
  let newName = $state('');
</script>

<div class="screen">
  <ScreenHeader title={m.body_regions_row_title()} back="/settings" subtitle={m.body_regions_intro()} />

  <section class="card" style="margin-bottom:var(--space-4)">
    <h2 class="editor-heading" style="margin-bottom:var(--space-3)">{m.body_regions_builtin_heading()}</h2>
    <div class="managed-tags">
      {#each builtIns as r (r.id)}
        <div class="rows-divide managed-tag" class:is-hidden={r.hidden}>
          <span class="managed-label">{r.name}</span>
          {#if r.hidden}<span class="muted small">{m.body_regions_hidden()}</span>{/if}
          <span class="managed-actions">
            <button
              class="icon-btn"
              data-region-hide={r.id}
              aria-label={r.hidden ? m.body_regions_show_aria({ region: r.name }) : m.body_regions_hide_aria({ region: r.name })}
              onclick={() => journal.bodyRegions.setRegionHidden(r.id, !r.hidden)}
            >
              <Icon name={r.hidden ? 'eye' : 'eyeOff'} size={16} />
            </button>
          </span>
        </div>
      {/each}
    </div>
  </section>

  <section class="card" style="margin-bottom:var(--space-4)">
    <h2 class="editor-heading" style="margin-bottom:var(--space-3)">{m.body_regions_custom_heading()}</h2>
    {#if customs.length === 0}
      <p class="muted small">{m.body_regions_custom_empty()}</p>
    {/if}
    <div class="managed-tags">
      {#each customs as r (r.id)}
        <div class="rows-divide managed-tag">
          <span class="managed-label">{r.name}</span>
        </div>
      {/each}
    </div>
  </section>

  <button
    class="btn btn-soft"
    onclick={() => {
      addOpen = true;
      newName = '';
    }}
  >
    <Icon name="plus" size={20} /><span>{m.body_regions_add()}</span>
  </button>

  <Sheet bind:open={addOpen} title={m.body_regions_new_sheet()}>
    <h3>{m.body_regions_new_sheet()}</h3>
    <div class="field">
      <input class="input" id="new-region-input" name="new-region-input" placeholder={m.body_regions_placeholder()} bind:value={newName} />
    </div>
    <button
      class="btn btn-primary"
      onclick={() => {
        if (newName.trim()) journal.bodyRegions.addCustomRegion(newName.trim());
        addOpen = false;
      }}><span>{m.body_regions_save()}</span></button
    >
  </Sheet>
</div>
