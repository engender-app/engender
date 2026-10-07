import type { ReadState } from './readState';

/** Fill once, after a successful read. Failed attempts leave retry armed. */
export function firstResult<T>(fill: (value: T | undefined) => void) {
  let filled = false;
  return (query: ReadState<T>) => {
    if (filled || query.loading || query.failed) return;
    filled = true;
    fill(query.value);
  };
}
