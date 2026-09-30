<script lang="ts">
  /* The entry editor's noticed-effects sheet (phase 12 ux-carpet ticket
     289). What it lists is `buildEffectPicker`'s job - the regimen's
     direction filter, the category groups, the search - and this is the
     drawing of it plus the two bits of state that belong to one opening of
     the sheet: the query and the "show all" lift.

     Both are reset when the sheet opens rather than when it closes: a reset
     on close would redraw the list while the sheet is still sliding out.

     Choosing is draft-only. A row ticks and unticks; an effect that already
     has a `personal_effect` row shows ticked with its date and cannot be
     toggled here, because a save never deletes one and never moves the day
     it was first noticed. Taking one off the record is `/care/changes`.

     Every row, heading and notice here arrives and leaves by collapsing
     (DIRECTION rule 10), so typing in the box or lifting the filter moves the
     rows under it instead of cutting them. */
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
    <div class="effect-group" data-effect-picker-group={group.key ?? 'results'} transition:collapse|global>
      {#if group.heading}<SectionHeading text={group.heading} />{/if}
      <ListCard {role}>
        {#each group.effects as effect (effect.key)}
          {@const since = recorded.get(effect.key)}
          <div class="rows-divide" transition:collapse|global>
            <ListRow
              key={effect.key}
              title={effect.name}
              subtitle={since !== undefined && m.entry_hrt_effects_noticed_on({ date: fmtDay(since, { day: 'numeric', month: 'short', year: 'numeric' }) })}
              checked={since !== undefined || chosen.includes(effect.key)}
              disabled={since !== undefined}
              data-effect-row={effect.key}
              onclick={() => onToggle(effect.key)}
            />
          </div>
        {/each}
      </ListCard>
    </div>
  {/each}

  {#if picker.groups.length === 0}
    <p class="muted effect-none" transition:collapse|global>{m.entry_hrt_effects_none()}</p>
  {/if}

  {#if picker.hiddenCount > 0}
    <div transition:collapse|global>
      <button class="btn btn-ghost press" data-effect-show-all onclick={() => (showAll = true)}>
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
  .effect-none { margin: var(--space-3) 0; }
  .effect-done { margin-top: var(--space-3); width: 100%; }
</style>
