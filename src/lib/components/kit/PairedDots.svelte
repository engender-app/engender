<script lang="ts">
  /* Two readings of the same scale, and the distance between them.

     This is the correlation cards' own mark, and it exists because they are
     not a bar chart. A bar answers "how much"; a correlation card answers
     "these days sat here, the other days sat there" - two positions on one
     scale, and the gap is the whole reading. Drawn as bars they were six
     rows of the same shape as the two bar charts above them on the screen,
     which is what "busy, overloaded, looks unfinished" was about (Alicja,
     2026-08-25, twice).

     So: one track per row, the metric's own range end to end, a hollow dot
     for the days without and a filled one for the days with, and the segment
     between them drawn thick. Nothing is ranked against another row, which a
     bar chart cannot help doing - every bar there is measured against the
     longest one - and nothing needs a shared scale, because each row's
     track is its own metric's range. That is what let the rows drop the
     sentence they used to carry.

     No colour says which way. The filled dot is the days the thing happened
     and the hollow one is the rest, on every row, whichever direction the
     gap runs (ADR-0012, F15). */
  import type { PairedRow } from './pairedRow';

  let { rows }: { rows: PairedRow[] } = $props();

  /* Where a value sits along its own track, as a percentage, clamped so a
     value outside the metric's stated range still lands on the track rather
     than off the end of it. */
  const at = (row: PairedRow, value: number) =>
    Math.min(100, Math.max(0, ((value - row.min) / Math.max(row.max - row.min, 1)) * 100));
</script>

<div class="kit-paired" data-chart="paired">
  {#each rows as row (row.key)}
    {@const without = at(row, row.without)}
    {@const with_ = at(row, row.with)}
    <div class="kit-paired-row" data-paired-row={row.key}>
      <div class="kit-paired-head">
        <span class="kit-paired-name" data-paired-name>{row.name}</span>
        <span class="kit-paired-gap" data-paired-gap>{row.gap}</span>
      </div>
      <div class="kit-paired-track">
        <span
          class="kit-paired-span"
          style={`--from: ${Math.min(without, with_)}%; --to: ${Math.max(without, with_)}%`}
        ></span>
        <span class="kit-paired-dot is-without" style={`--at: ${without}%`}></span>
        <span class="kit-paired-dot is-with" style={`--at: ${with_}%`}></span>
      </div>
      <span class="kit-paired-note">{row.note}</span>
    </div>
  {/each}
</div>
