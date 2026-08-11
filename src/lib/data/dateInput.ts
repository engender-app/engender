/* Converts between an HTML <input type="date"> value (a plain YYYY-MM-DD
   string) and a Date object holding the same local year/month/day. This is
   not an epoch-day conversion — src/lib/data/dates.ts owns those. */

export function dateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateFromInputValue(s: string): Date {
  const [y, mo, d] = s.split('-').map(Number);
  return new Date(y, mo - 1, d);
}
