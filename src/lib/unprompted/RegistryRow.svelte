<script lang="ts">
  /* One row of the unprompted registry (phase 6 ticket 04, merged onto one
     screen by deepening ticket 09). A row answers up to two questions -
     "does this show on Home" and "does this notify" - so it takes up to two
     switches, each in its own slot; a kind that doesn't fire leaves the
     second slot empty rather than showing a dead control (ticket 09's
     acceptance line).

     A plain .kit-row div rather than ListRow: ListRow renders an <a> or a
     <button>, and a switch inside either would be a control nested in a
     control, which is the line settings-surfaces.test.ts holds.

     The data-live-tile/data-notification handles moved from the row (one
     handle per row, back when a row carried one switch) onto each slot, so
     the walkthrough can still grip the surface switch and the notify switch
     of the same kind independently now that both sit on one row. */
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
    subtitle: string;
    /** Present when this kind has a Home-screen switch on this row. */
    surface?: { label: string; checked: boolean; onChange: (v: boolean) => void };
    /** Present when this kind has a notification switch on this row. */
    notify?: { label: string; checked: boolean; onChange: (v: boolean) => void };
  } = $props();
</script>

<div class="kit-row">
  <span class="kit-row-text">
    <span class="kit-row-title">{title}</span>
    <span class="kit-row-sub">{subtitle}</span>
  </span>
  <span class="kit-row-trail">
    <span class="kit-row-toggle" data-live-tile={surface ? key : undefined}>
      {#if surface}
        <Switch checked={surface.checked} label={surface.label} onChange={surface.onChange} />
      {/if}
    </span>
    <span class="kit-row-toggle" data-notification={notify ? key : undefined}>
      {#if notify}
        <Switch checked={notify.checked} label={notify.label} onChange={notify.onChange} />
      {/if}
    </span>
  </span>
</div>

<style>
  /* Fixed at the switch's own touch target, not the switch's content width,
     so the two columns line up down every row regardless of which rows have
     a control in which slot - the empty slot still holds the space. */
  .kit-row-toggle {
    flex: 0 0 var(--touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
