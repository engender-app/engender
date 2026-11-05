/** Hands each palette name under a flag the width of its longest word, in
 *  ems, as --word-em. screens.css divides the column (100cqi) by it, so a
 *  name whose longest word outgrows its column steps its type down, and one
 *  that fits keeps --text-xs (pre-publish 03). The width in ems does not
 *  change with the column, so a resize needs nothing from here; it is read
 *  once on mount, before the grid paints, and again only if the face was
 *  still loading then. */
export function paletteNameFit(grid: HTMLElement) {
  function measure() {
    const ruler = document.createElement('span');
    ruler.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    grid.append(ruler);
    for (const name of grid.querySelectorAll<HTMLElement>('.swatch-name')) {
      const style = getComputedStyle(name);
      ruler.style.font = style.font;
      ruler.style.letterSpacing = style.letterSpacing;
      const size = parseFloat(style.fontSize);
      let widest = 0;
      for (const word of (name.textContent ?? '').split(/\s+/)) {
        ruler.textContent = word;
        widest = Math.max(widest, ruler.getBoundingClientRect().width);
      }
      name.style.setProperty('--word-em', (widest / size).toFixed(4));
    }
    ruler.remove();
  }

  measure();
  let live = true;
  if (document.fonts.status !== 'loaded') void document.fonts.ready.then(() => live && measure());
  return { destroy() { live = false; } };
}
