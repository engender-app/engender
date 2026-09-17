<script lang="ts">
  import { Toggle } from 'melt/builders';

  let {
    checked = false,
    label,
    onChange,
    disabled = false,
  }: {
    checked?: boolean;
    label: string;
    onChange: (v: boolean) => void;
    /** Off where the preference cannot apply, so it cannot look like a
        working control for something that does nothing (UI/UX ticket 09).
        Presentation only: the stored preference is untouched, and the switch
        reads it again the moment the mode makes it true. A native disabled
        button both blocks the activation and announces itself as dimmed. */
    disabled?: boolean;
  } = $props();

  // Melt UI toggle provides the behaviour; visually styled as a switch.
  const toggle = new Toggle({
    value: () => checked,
    onValueChange: (v) => onChange(v),
  });
</script>

<button {...toggle.trigger} class="switch" role="switch" aria-checked={checked} aria-label={label} {disabled}>
  <span class="switch-track"><span class="switch-thumb"></span></span>
</button>
