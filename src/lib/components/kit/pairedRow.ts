/* One row of the paired-dot chart, as a type a plain module can import -
   same split kit/barRow.ts makes. */
export interface PairedRow {
  key: string;
  name: string;
  /** The reading on the days the thing happened. */
  with: number;
  /** The reading on the days it did not. */
  without: number;
  /** The two ends of the metric's own range, so each row's track is its own
      scale and no row is measured against another. */
  min: number;
  max: number;
  /** The distance between the two, formatted and signed by the caller. */
  gap: string;
  /** Which scale, and how many entries. */
  note: string;
}
