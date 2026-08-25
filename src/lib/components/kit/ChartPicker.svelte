<script lang="ts">
  /* Which reading a chart is plotting, as the heading's one control.

     This is what lets one chart serve every scale rather than a card per
     dimension - DIRECTION.md's chart rules ask for exactly that on the
     day-by-day chart, and it is also what makes the tier-3 re-tween worth
     having, since switching the metric is the switch people make most.

     A native <select>, so Android opens its own picker and a keyboard, a
     screen reader and the system font scale all get what they expect. A
     custom dropdown here would be a worse version of a control the platform
     already ships.

     It is drawn twice, though, because the two things it owes disagree: the
     pill has to sit inside the heading's own line, and a control has to be
     48dp to press. So the pill is a span at the heading's height and the
     real select is invisible on top of it at the full touch target. The
     select stays the thing that is focused, announced and opened; the span
     is what is seen, and it is hidden from a screen reader so the control
     is not announced twice. */
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
