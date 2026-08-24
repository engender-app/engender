<script lang="ts">
  /* One tile of the grid: where it goes, and the reading that is the reason
     to go there.

     The value is the tile's own data rather than a hero metric - a big
     accent number with a small label and a supporting line was the template
     the slop audit removed from Home. Here the number sits under the title
     it belongs to and a tile with nothing to report is a title and a note.

     The number is filled with the flag: hard-edged bands, in stripe order,
     through the numerals themselves. It is the one place in the kit where
     the flag appears whole rather than one stripe at a time, and it is
     drawn from --flag-fill, which the grid above sets from
     $lib/theme/roles. Where a runtime cannot clip a background to text the
     number is the section's own mark colour, which is what it was before.

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
