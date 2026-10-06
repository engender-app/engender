<script lang="ts">
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { discloseWidth } from '$lib/motion/reveal';
  import { toast } from '$lib/stores/toasts.svelte';

  let builtIns = $derived(vocabulary.bodyRegions.filter((r) => r.builtIn));
  let customs = $derived(vocabulary.bodyRegions.filter((r) => !r.builtIn));

  let addOpen = $state(false);
  let newName = $state('');

  /* A custom region carries the same hide control the built-ins have, plus
     a rename, since a typo in one otherwise sat in every picker for good
     (after-release 07). A built-in keeps the catalogue's name. */
  let renameTarget = $state<{ id: string; name: string } | null>(null);

  async function rename() {
    const target = renameTarget;
    const name = target?.name.trim();
    if (!target || !name) return;
    renameTarget = null;
    await journal.bodyRegions.renameCustomRegion(target.id, name);
    toast(m.body_regions_renamed({ region: name }));
  }

  /* Latched: the mirror re-arms `ready` on a journal re-open, and a reserve
     must not put its placeholder back over settled lists. */
  let listsRevealed = $state(false);
  $effect.pre(() => {
    if (vocabulary.ready) listsRevealed = true;
  });
  const listsEstimate = readReserve('body-regions');
  const listsRemember = (px: number) => rememberReserve('body-regions', px);
</script>

<div class="screen">
  <ScreenHeader title={m.body_regions_row_title()} back="/settings" subtitle={m.body_regions_intro()} />

  <!-- Custom before built-in, and the add button with it (phase 11 ticket
       38): the same order the affirmations screen takes, for the same
       reason - ten built-in regions stood between arriving here and adding
       the one region a person came to name. -->
  <SectionHeading text={m.body_regions_custom_heading()} />

  <button
    class="btn btn-soft"
    data-add-region
    onclick={() => {
      addOpen = true;
      newName = '';
    }}
  >
    <Icon name="plus" size={20} /><span>{m.body_regions_add()}</span>
  </button>

  <!-- Gated on the vocabulary mirror (ticket 152's gap): a cold open paints
       before it fills, so the lists cut in at full opacity when it did (ux-carpet
       ticket 211). Held at last visit's height, faded in. -->
  <ReadReserve ready={listsRevealed} estimate={listsEstimate} onrest={listsRemember}>
    {#if customs.length === 0}
      <p class="muted small">{m.body_regions_custom_empty()}</p>
    {/if}
    <div class="managed-tags">
      {#each customs as r (r.id)}
        <div class="rows-divide managed-tag" class:is-hidden={r.hidden}>
          <span class="managed-label" data-region-label={r.id}>{r.name}</span>
          {#if r.hidden}<span class="muted small" transition:discloseWidth>{m.body_regions_hidden()}</span>{/if}
          <span class="managed-actions">
            <button
              class="icon-btn"
              data-region-rename={r.id}
              aria-label={m.body_regions_rename_aria({ region: r.name })}
              onclick={() => (renameTarget = { id: r.id, name: r.name })}
            >
              <Icon name="pencil" size={16} />
            </button>
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

    <details class="managed-group">
      <summary>{m.body_regions_builtin_heading()}</summary>
      <div class="managed-tags">
        {#each builtIns as r (r.id)}
          <div class="rows-divide managed-tag" class:is-hidden={r.hidden}>
            <span class="managed-label">{r.name}</span>
            {#if r.hidden}<span class="muted small" transition:discloseWidth>{m.body_regions_hidden()}</span>{/if}
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
    </details>
  </ReadReserve>

  <Sheet bind:open={addOpen} title={m.body_regions_new_sheet()}>
    <h3>{m.body_regions_new_sheet()}</h3>
    <Field label={m.body_regions_new_sheet()} id="new-region-input" hidden>
      {#snippet children(id)}
        <input class="input" {id} name="new-region-input" placeholder={m.body_regions_placeholder()} bind:value={newName} />
      {/snippet}
    </Field>
    <button
      class="btn btn-primary"
      onclick={() => {
        if (newName.trim()) journal.bodyRegions.addCustomRegion(newName.trim());
        addOpen = false;
      }}><span>{m.body_regions_save()}</span></button
    >
  </Sheet>

  <Sheet open={renameTarget !== null} title={m.body_regions_rename_sheet()} onClose={() => (renameTarget = null)}>
    {#if renameTarget}
      <h3>{m.body_regions_rename_sheet()}</h3>
      <Field label={m.body_regions_rename_sheet()} id="rename-region-input" hidden>
        {#snippet children(id)}
          <input class="input" {id} name="rename-region-input" bind:value={renameTarget!.name} />
        {/snippet}
      </Field>
      <button class="btn btn-primary" data-save-region-name disabled={!renameTarget.name.trim()} onclick={rename}>
        <span>{m.body_regions_save()}</span>
      </button>
    {/if}
  </Sheet>
</div>
