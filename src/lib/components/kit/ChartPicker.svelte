<script lang="ts">
  /* A native select gives Android its picker and handles keyboard,
     screen readers and text scaling. Keep the visible pill the
     height of the chart heading. Overlay a transparent 48dp
     select and hide the decorative pill from assistive tech. */
  import Icon from '../Icon.svelte';

  let {
    value,
    options,
    onPick,
    label,
    labelledBy,
    id,
    key
  }: {
    value: string;
    options: { value: string; label: string }[];
    onPick: (value: string) => void;
    /** Names the control for a screen reader where nothing on the screen
        does: on a heading's line, the heading says what the chart shows and
        not what this changes. One of this and `labelledBy` is required. */
    label?: string;
    /** The id of visible words that already name it. Unlike the slider's
        root, this really is a `<select>`, so a `<label for>` can name it -
        and where a screen writes the words out (the calendar's "Colour days
        by") that label is the name rather than a second copy of it. Same
        contract as Slider.svelte's. */
    labelledBy?: string;
    /** The select's own id, for a visible `<label for>` to point at. */
    id?: string;
    key?: string;
  } = $props();

  let selected = $derived(options.find((option) => option.value === value)?.label ?? '');
</script>

<span class="kit-chart-pick">
  <!-- The select first, so the pill after it can take a focus ring from a
       sibling selector rather than from :has(), which the oldest WebView
       the app supports does not know. -->
  <select
    {id}
    aria-label={labelledBy ? undefined : label}
    aria-labelledby={labelledBy}
    data-chart-picker={key}
    {value}
    onchange={(event) => onPick((event.currentTarget as HTMLSelectElement).value)}
  >
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
  <span class="kit-chart-pick-face" aria-hidden="true">
    <span class="kit-chart-pick-label">{selected}</span>
    <Icon name="chevronDown" size={14} />
  </span>
</span>
