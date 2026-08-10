<script lang="ts">
  import { Toggle } from 'melt/builders';

  let {
    checked = false,
    label,
    onChange,
  }: { checked?: boolean; label: string; onChange: (v: boolean) => void } = $props();

  // Melt UI toggle provides the behaviour; visually styled as a switch.
  const toggle = new Toggle({
    value: () => checked,
    onValueChange: (v) => onChange(v),
  });
</script>

<button {...toggle.trigger} class="switch" role="switch" aria-checked={checked} aria-label={label}>
  <span class="switch-track"><span class="switch-thumb"></span></span>
</button>
