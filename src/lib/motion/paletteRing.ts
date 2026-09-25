/** One outline follows the selected Settings swatch across both grid axes. */
export function paletteRing(grid: HTMLElement) {
  const ring = grid.querySelector<HTMLElement>('.palette-selection-ring');
  if (!ring) return;

  function place() {
    if (!ring) return;
    const preview = grid.querySelector<HTMLElement>('[data-palette-pick][aria-checked="true"] .swatch-preview');
    if (!preview) return;
    const gridBox = grid.getBoundingClientRect();
    const box = preview.getBoundingClientRect();
    ring.style.transform = `translate(${box.left - gridBox.left - 4}px, ${box.top - gridBox.top - 4}px)`;
    ring.classList.add('is-placed');
  }

  place();
  const mutations = new MutationObserver(place);
  mutations.observe(grid, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked'] });
  const resize = new ResizeObserver(place);
  resize.observe(grid);
  return { destroy() { mutations.disconnect(); resize.disconnect(); } };
}
