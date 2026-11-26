<script lang="ts">
  /* buildEffectPicker owns filtering and grouping. Reset search and
     show-all on open so closing never redraws during exit.

     Picks change the draft. A stored personal_effect stays ticked
     and keeps its first-noticed date. Remove it through /care/changes.
     Local collapse animates list changes without replaying rows when
     the sheet opens (DIRECTION.md rule 10). */
  import { m } from '$lib/paraglide/messages';
  import type { PersonalEffectCatalogEntry } from '$lib/data/types';
  import type { Role } from '$lib/theme/roles';
  import { fmtDay } from '$lib/data/dates';
  import { buildEffectPicker } from '$lib/data/effectPicker';
  import { effectCategoryName } from '$lib/data/vocabulary/labels';
  import { collapse } from '$lib/motion/reveal';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';

  let {
    open = $bindable(false),
    role,
    effects,
    categoryOrder,
    drugs,
    chosen,
    recorded,
    onToggle
  }: {
    open?: boolean;
    role?: Role;
    /** Every effect the person has not hidden, in the catalogue's words. */
    effects: PersonalEffectCatalogEntry[];
    categoryOrder: string[];
    /** The drug names of the regimen episodes active on the entry's day. */
    drugs: string[];
    /** Keys chosen in this draft. */
    chosen: string[];
    /** Effects already on the record, by the day they were first noticed. */
    recorded: Map<string, number>;
    onToggle: (key: string) => void;
  } = $props();

  let query = $state('');
  let showAll = $state(false);
  let box = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (open) {
      query = '';
      showAll = false;
    }
  });

  let picker = $derived(
    buildEffectPicker({
      effects,
      categoryOrder,
      categoryName: effectCategoryName,
      customHeading: m.entry_hrt_effects_custom_heading(),
      drugs,
      showAll,
      query
    })
  );
</script>

<Sheet bind:open title={m.entry_hrt_effects_sheet_title()}>
  <SectionHeading text={m.entry_hrt_effects_sheet_title()} />
  <div class="search-box effect-search">
    <Icon name="search" size={20} />
    <input
      class="search-input"
      bind:this={box}
      name="effect-q"
      type="search"
      placeholder={m.entry_hrt_effects_search()}
      aria-label={m.entry_hrt_effects_search()}
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
      enterkeyhint="search"
      data-effect-search
      bind:value={query}
    />
    {#if query}
      <button
        class="field-search-clear press"
        data-effect-search-clear
        aria-label={m.hub_search_clear()}
        transition:collapse
        onclick={() => {
          query = '';
          box?.focus();
        }}
      >
        <Icon name="x" size={20} />
      </button>
    {/if}
  </div>

  {#each picker.groups as group (group.key)}
    <div class="effect-group" data-effect-picker-group={group.key ?? 'results'} transition:collapse>
      {#if group.heading}<SectionHeading text={group.heading} />{/if}
      <ListCard {role}>
        {#each group.effects as effect (effect.key)}
          {@const since = recorded.get(effect.key)}
          <div class="rows-divide" transition:collapse>
            <ListRow
              key={effect.key}
              title={effect.name}
              subtitle={since !== undefined && m.entry_hrt_effects_noticed_on({ date: fmtDay(since, { day: 'numeric', month: 'short', year: 'numeric' }) })}
              checked={since !== undefined || chosen.includes(effect.key)}
              chevron={false}
              disabled={since !== undefined}
              onclick={() => onToggle(effect.key)}
            />
          </div>
        {/each}
      </ListCard>
    </div>
  {/each}

  {#if picker.groups.length === 0}
    <p class="muted effect-none" transition:collapse>{m.entry_hrt_effects_none()}</p>
  {/if}

  {#if picker.hiddenCount > 0}
    <div transition:collapse>
      <button class="btn btn-ghost press effect-show-all" data-effect-show-all onclick={() => (showAll = true)}>
        <span>{m.entry_hrt_effects_show_all()}</span>
      </button>
    </div>
  {/if}

  <button class="btn btn-primary press effect-done" data-effect-done onclick={() => (open = false)}>
    <span>{m.done()}</span>
  </button>
</Sheet>

<style>
  .effect-search { margin-bottom: var(--space-3); }
  .effect-group { margin-bottom: var(--space-3); }
  /* Chromium's own clear cross is 16px, under the touch floor and drawn by
     nothing else; the box draws its own (the button beside the input), the
     same call the More search makes. */
  .effect-search :global(.search-input::-webkit-search-cancel-button) { display: none; }
  .field-search-clear {
    flex: 0 0 auto;
    width: var(--touch-target);
    height: var(--touch-target);
    margin-right: calc(-1 * var(--space-3));
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: none;
    color: var(--text);
    cursor: pointer;
  }
  .field-search-clear:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: -2px;
  }
  .effect-show-all { width: 100%; }
  .effect-none { margin: var(--space-3) 0; }
  .effect-done { margin-top: var(--space-3); width: 100%; }
</style>
