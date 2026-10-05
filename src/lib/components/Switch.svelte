<script lang="ts">
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

  /* A plain button with role="switch", and aria-checked as its one state.
     It used to spread Melt's Toggle trigger, which also set aria-pressed:
     a toggle button's state on top of a switch's, so axe flagged every
     switch in the app and a screen reader was handed two answers to one
     question (release blockers 09). Space and Enter come from the button
     itself, and a native disabled button already refuses the click. */
  const flip = () => onChange(!checked);
</script>

<button type="button" class="switch" role="switch" aria-checked={checked} aria-label={label} {disabled} onclick={flip}>
  <span class="switch-track"><span class="switch-thumb"></span></span>
</button>
