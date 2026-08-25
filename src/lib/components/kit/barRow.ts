/* One row of the horizontal bar chart, as a type a plain module can import.

   It lived inside BarRows.svelte, which is where a component's own props
   belong - but the rows are built by the screens and by
   $lib/data/wrappedDisplay, and a `.ts` file cannot import a type out of a
   `.svelte` one. Same split kit/role.ts already makes: the drawing is the
   component's, the shape of what it draws is not. */
export interface BarRow {
  key: string;
  name: string;
  /** Under the name: a count, a unit, a period. */
  note?: string;
  /** The reading, formatted by the caller. */
  value: string;
  /** What the bar's length is drawn from. */
  amount: number;
}
