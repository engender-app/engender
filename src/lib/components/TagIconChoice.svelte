<script lang="ts">
  /* Native radios give the icon choices arrow-key navigation and a
     count in screen readers. */
  import { m } from '$lib/paraglide/messages';
  import { TAG_ICON_NAMES, tagIconSvg } from './tagIcons';

  let { value = $bindable(null), name }: { value: string | null; name: string } = $props();

  function showChecked(grid: HTMLElement) {
    const checked = grid.querySelector<HTMLElement>('.is-selected');
    if (checked) grid.scrollTop = checked.offsetTop - (grid.clientHeight - checked.offsetHeight) / 2;
  }
</script>

<fieldset class="icon-choice" data-tag-icon-choice>
  <legend class="tag-group-name">
    {value === null ? m.tags_icon() : m.tags_icon_selected({ name: m.tag_icon_name({ icon: value }) })}
  </legend>
  <div class="icon-choice-grid" use:showChecked data-sheet-no-drag>
    <label class="icon-choice-cell" class:is-selected={value === null} title={m.tags_icon_none()}>
      <input class="visually-hidden" type="radio" {name} checked={value === null} onchange={() => (value = null)} data-icon-none />
      <span class="icon-choice-none" aria-hidden="true"></span>
      <span class="visually-hidden">{m.tags_icon_none()}</span>
    </label>
    {#each TAG_ICON_NAMES as icon (icon)}
      {@const label = m.tag_icon_name({ icon })}
      <label class="icon-choice-cell" class:is-selected={value === icon} title={label}>
        <input class="visually-hidden" type="radio" {name} checked={value === icon} onchange={() => (value = icon)} data-icon={icon} />
        {@html tagIconSvg(icon, 22)}
        <span class="visually-hidden">{label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .icon-choice {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  /* Four and a half rows show, the half saying there is more; the rest
     scroll inside, so the sheet's button stays in reach under 121 choices. */
  .icon-choice-grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: var(--space-1);
    max-height: 232px;
    overflow-y: auto;
    padding: 2px;
  }
  .icon-choice-cell {
    position: relative;
    display: grid;
    place-items: center;
    height: 48px;
    border-radius: var(--r-block);
    border: 1.5px solid transparent;
    color: var(--text-2);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }
  .icon-choice-cell:hover {
    border-color: var(--outline);
  }
  .icon-choice-cell.is-selected {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--on-accent-soft);
  }
  .icon-choice-cell:has(input:focus-visible) {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: 1px;
  }
  /* No icon: an empty slot struck through. Not a dashed ring, which is
     what the set's own `circle-dashed` draws. */
  .icon-choice-none {
    position: relative;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1.5px solid currentColor;
    opacity: 0.7;
  }
  .icon-choice-none::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -4px;
    bottom: -4px;
    border-left: 1.5px solid currentColor;
    rotate: 45deg;
  }
</style>
