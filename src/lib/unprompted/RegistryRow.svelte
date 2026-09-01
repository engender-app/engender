<script lang="ts">
  /* One row of the unprompted registry, on whichever of the two views is
     drawing it (phase 6 ticket 04). Both screens render the same thing - a
     title, a line saying what it does or when it fires, and a switch - and
     the point of one registry behind two views is lost if the row itself is
     written out twice.

     A plain .kit-row div rather than ListRow: ListRow renders an <a> or a
     <button>, and a switch inside either would be a control nested in a
     control, which is the line settings-surfaces.test.ts holds.

     The handle is passed in rather than derived from the key, because the
     two views grip different ones: the walkthrough and the tile tickets
     already know `data-live-tile`, and the notifications view is new enough
     to name its own (ADR-0029). */
  import Switch from '$lib/components/Switch.svelte';

  let {
    handle,
    key,
    title,
    subtitle,
    checked,
    onChange
  }: {
    /** The data- attribute this view is gripped by. */
    handle: 'live-tile' | 'notification';
    key: string;
    title: string;
    subtitle: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  } = $props();
</script>

<div class="kit-row" data-live-tile={handle === 'live-tile' ? key : undefined} data-notification={handle === 'notification' ? key : undefined}>
  <span class="kit-row-text">
    <span class="kit-row-title">{title}</span>
    <span class="kit-row-sub">{subtitle}</span>
  </span>
  <span class="kit-row-trail">
    <Switch {checked} label={title} {onChange} />
  </span>
</div>
