/** Words reads every note once, even when its tile has nothing to show. */
export function assertLookBackWordsRead(calls: number, rows: number): void {
  if (calls !== 1 || rows <= 0) {
    throw new Error(`Mounted Look back must read Words notes once; got ${calls} calls and ${rows} rows`);
  }
}
