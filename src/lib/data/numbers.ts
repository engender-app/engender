export function formatNumber(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {}
): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20, ...options }).format(value);
}
