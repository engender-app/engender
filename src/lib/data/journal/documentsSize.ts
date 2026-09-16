/* The unit a total byte figure displays in (phase 10 redesign ticket 58,
   DIRECTION.md rule 16's "how much space they take"). Pure, so a Node test
   can hold the MB/KB threshold without pulling in `Intl` or paraglide
   (ADR-0016) - $lib/data/vocabulary/documentsSummary.ts is where the
   number this returns actually gets formatted and worded. */

export interface DisplaySize {
  value: number;
  unit: 'MB' | 'KB';
}

const KB = 1024;
const MB = KB * 1024;

/** Bytes as whichever unit reads as a number a person can hold at a
    glance - MB once there is at least one, KB below that, and never a
    bare byte count: nobody thinks in bytes about a photographed page. An
    empty vault (0 bytes) still reads in KB rather than unit-less, since
    "0 KB" is an honest reading and a bare "0" looks like a bug rather
    than an empty vault. */
export function bytesToDisplaySize(bytes: number): DisplaySize {
  if (bytes >= MB) return { value: bytes / MB, unit: 'MB' };
  return { value: bytes / KB, unit: 'KB' };
}
