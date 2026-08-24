<script lang="ts">
  /* One tile of the grid: where it goes, and the reading that is the reason
     to go there.

     The value is the tile's own data rather than a hero metric - a big
     accent number with a small label and a supporting line was the template
     the slop audit removed from Home. Here the number sits under the title
     it belongs to, at the size of a section heading rather than of a
     headline, and a tile with nothing to report is a title and a note.

     `.press` is tier 1, from $lib/motion/press.css: the whole tile answers
     a press by scaling, which a full-width list row cannot do without
     moving the card around it. */
  let {
    title,
    value,
    note,
    href,
    key
  }: {
    title: string;
    /** The tile's reading, already formatted. */
    value?: string;
    /** A line under the value, or under the title where there is no value. */
    note?: string;
    href: string;
    key?: string;
  } = $props();
</script>

<a class="kit-tile press" data-tile={key} {href}>
  <span class="kit-tile-title">{title}</span>
  {#if value}<span class="kit-tile-value">{value}</span>{/if}
  {#if note}<span class="kit-tile-note">{note}</span>{/if}
</a>
