/** Keep same-day marks visible without changing the dates they represent. */
export function visibleSegment(left: number, right: number, railWidth: number) {
  const width = Math.max(railWidth, 1);
  if (right - left < 3) {
    const center = (left + right) / 2;
    left = Math.max(0, Math.min(width - 3, center - 1.5));
    right = left + 3;
  }
  return { left: (left / width) * 100, width: ((right - left) / width) * 100, leftPx: left, widthPx: right - left };
}

/** Separate coincident slider grips; keep slider values on actual dates. */
export function distinctHandlePositions(start: number, end: number, railWidth: number) {
  const minGap = 14;
  if (end - start >= minGap || railWidth < minGap) return { start, end };
  const separatedEnd = Math.min(railWidth, Math.max(minGap, (start + end + minGap) / 2));
  return { start: separatedEnd - minGap, end: separatedEnd };
}
