<script lang="ts">
  /* Which icon an own tag wears (pre-release-human 22): no icon, or one of
     the 120 in tagIcons.ts. Native radios, so arrow keys and a screen
     reader's "1 of 121" come with them. Each is named by Lucide's own name
     for the drawing, in English in both languages. */
  import { m } from '$lib/paraglide/messages';
  import { TAG_ICON_NAMES, tagIconSvg } from './tagIcons';

  let { value = $bindable(null), name }: { value: string | null; name: string } = $props();

  const spoken = (icon: string) => icon.replaceAll('-', ' ');
</script>

<fieldset class="icon-choice" data-tag-icon-choice>
  <legend class="tag-group-name">{m.tags_icon()}</legend>
  <div class="icon-choice-grid">
    <label class="icon-choice-cell" class:is-selected={value === null} title={m.tags_icon_none()}>
      <input class="visually-hidden" type="radio" {name} checked={value === null} onchange={() => (value = null)} data-icon-none />
      <span class="icon-choice-none" aria-hidden="true"></span>
      <span class="visually-hidden">{m.tags_icon_none()}</span>
    </label>
    {#each TAG_ICON_NAMES as icon (icon)}
      <label class="icon-choice-cell" class:is-selected={value === icon} title={spoken(icon)}>
        <input class="visually-hidden" type="radio" {name} checked={value === icon} onchange={() => (value = icon)} data-icon={icon} />
        {@html tagIconSvg(icon, 22)}
        <span class="visually-hidden">{spoken(icon)}</span>
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
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: var(--space-1);
    max-height: 232px;
    overflow-y: auto;
    padding: 2px;
  }
  .icon-choice-cell {
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
    outline: 2px solid var(--focus-ring);
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
