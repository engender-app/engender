<script lang="ts">
  /* Which reading a chart is plotting, as the heading's one control.

     This is what lets one chart serve every scale rather than a card per
     dimension - DIRECTION.md's chart rules ask for exactly that on the
     day-by-day chart, and it is also what makes the tier-3 re-tween worth
     having, since switching the metric is the switch people make most.

     A native <select>, so Android opens its own picker and a keyboard, a
     screen reader and the system font scale all get what they expect.
     Styled down to a pill rather than reinvented: a custom dropdown here
     would be a worse version of a control the platform already ships. */
  import Icon from '../Icon.svelte';

  let {
    value,
    options,
    onPick,
    label,
    key
  }: {
    value: string;
    options: { value: string; label: string }[];
    onPick: (value: string) => void;
    /** Names the control for a screen reader: the heading beside it says
        what the chart shows, not what this changes. */
    label: string;
    key?: string;
  } = $props();
</script>

<span class="kit-chart-pick">
  <select
    aria-label={label}
    data-chart-picker={key}
    {value}
    onchange={(event) => onPick((event.currentTarget as HTMLSelectElement).value)}
  >
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
  <Icon name="chevronDown" size={18} />
</span>
