<script lang="ts">
  /* A choice among a few peers. The pill behind the chosen one is a single
     element that slides between them rather than a background that appears on
     one and disappears from another: the point of a segmented control is that
     the options are a set, and a pill crossing the set says which one you came
     from as well as which one you are on.

     It stretches along the way. Nothing physical changes position without
     deforming a little, and a pill that arrives the same width it left reads
     as a diagram of a slide rather than as a thing sliding. */
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

  let buttons = $state<(HTMLButtonElement | undefined)[]>([]);
  let pill = $state({ x: 0, w: 0 });
  /** Set while the pill is crossing, which is what plays the stretch. Not set
      on the first measurement: the control does not slide into its own initial
      state, it starts there. */
  let sliding = $state(false);
  let placed = false;

  $effect(() => {
    const target = buttons[options.findIndex((o) => o.value === value)];
    if (!target) return;
    const next = { x: target.offsetLeft, w: target.offsetWidth };
    if (next.x === pill.x && next.w === pill.w) return;
    if (placed) sliding = true;
    placed = true;
    pill = next;
  });
</script>

<div
  class="segmented"
  role="radiogroup"
  aria-label={name}
  style:--seg-x="{pill.x}px"
  style:--seg-w="{pill.w}px"
>
  <span
    class="segment-pill"
    class:is-sliding={sliding}
    aria-hidden="true"
    onanimationend={() => (sliding = false)}
  ></span>
  {#each options as o, i (o.value)}
    <button
      bind:this={buttons[i]}
      class="segment"
      class:is-active={o.value === value}
      role="radio"
      aria-checked={o.value === value}
      data-segment={o.value}
      onclick={() => onChange(o.value)}>{o.label}</button
    >
  {/each}
</div>
