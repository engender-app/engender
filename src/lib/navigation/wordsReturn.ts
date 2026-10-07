/** A return link must remain on this origin after browser URL parsing. */
export function wordsReturnPath(value: string | null): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/u.test(value)) return null;
  return value;
}
