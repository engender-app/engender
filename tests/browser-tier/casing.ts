/* What a chart line's casing looks like once drawn (phase 15 ticket 20):
   the element right under the line, read through computed style, so a probe
   can say the line is edged in the role's edge rather than only that the
   role carries one. A node test can prove the colour; only a render can
   prove the casing is there, under its own line, a pixel wider each side. */

function rgb(hex: string) {
  const raw = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(raw.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

export function casingOf(line: Element | null, edge: string | null) {
  if (!line) return { found: false };
  const under = line.previousElementSibling;
  const lineStyle = getComputedStyle(line);
  const underStyle = under ? getComputedStyle(under) : null;
  return {
    found: true,
    expected: edge ? rgb(edge) : null,
    casing: underStyle?.stroke ?? null,
    line: lineStyle.stroke,
    /* A casing reaches a pixel past its line on each side. */
    widens: underStyle ? parseFloat(underStyle.strokeWidth) - parseFloat(lineStyle.strokeWidth) : null,
    sameGeometry:
      !!under &&
      (under.getAttribute('d') ?? under.getAttribute('points')) ===
        (line.getAttribute('d') ?? line.getAttribute('points'))
  };
}
