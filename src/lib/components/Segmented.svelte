<script lang="ts">
  let {
    name,
    options,
    value,
    onChange,
  }: {
    name: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
  } = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={name}>
  {#each options as o (o.value)}
    <button
      class="segment"
      class:is-active={o.value === value}
      role="radio"
      aria-checked={o.value === value}
      onclick={() => onChange(o.value)}>{o.label}</button
    >
  {/each}
</div>
