<script lang="ts">
  /* One row of the unprompted registry. A row answers up to two questions - "does this show
     on Home" and "does this notify" - so it takes up to two switches, each in its own slot;
     a kind that doesn't fire gets no second slot rather than a dead control.

     A plain.kit-row div rather than ListRow: ListRow renders an <a> or a <button>, and a
     switch inside either would be a control nested in a control, which is the line
     settings-surfaces.test.ts holds.

     The data-live-tile/data-notification handles moved from the row (one handle per row,
     back when a row carried one switch) onto each slot, so the walkthrough can still grip
     the surface switch and the notify switch of the same kind independently now that both
     sit on one row. */
  import Switch from '$lib/components/Switch.svelte';

  let {
    key,
    title,
    subtitle,
    surface,
    notify
  }: {
    key: string;
    title: string;
    subtitle?: string;
    /** Present when this kind has a Home-screen switch on this row. */
    surface?: { label: string; checked: boolean; onChange: (v: boolean) => void };
    /** Present when this kind has a notification switch on this row. */
    notify?: { label: string; checked: boolean; onChange: (v: boolean) => void };
  } = $props();
</script>

<div class="kit-row">
  <span class="kit-row-text">
    <span class="kit-row-title">{title}</span>
    {#if subtitle}<span class="kit-row-sub">{subtitle}</span>{/if}
  </span>
  <span class="kit-row-trail">
    {#if surface}
      <span class="kit-row-toggle" data-live-tile={key}>
        <Switch checked={surface.checked} label={surface.label} onChange={surface.onChange} />
      </span>
    {/if}
    {#if notify}
      <span class="kit-row-toggle" data-notification={key}>
        <Switch checked={notify.checked} label={notify.label} onChange={notify.onChange} />
      </span>
    {/if}
  </span>
</div>

<style>
  /* Fixed at the switch's own touch target, not the switch's content width,
     so every switch on the screen sits the same distance from the edge. A
     slot is drawn only for a switch the row has: an empty one held 48px and
     pushed a lone switch in from the edge (FA 08 sign-off). */
  .kit-row-toggle {
    flex: 0 0 var(--touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
