/** One frame follows the selected Settings flag across both grid axes, sized to the flag's block. */
export function paletteRing(grid: HTMLElement) {
  const ring = grid.querySelector<HTMLElement>('.palette-selection-ring');
  if (!ring) return;
  let visible = false;

  function place() {
    if (!ring) return;
    const preview = grid.querySelector<HTMLElement>('[data-palette-pick][aria-checked="true"] .swatch-preview');
    if (!preview) return;
    const gridBox = grid.getBoundingClientRect();
    const box = preview.getBoundingClientRect();
    if (!gridBox.width || !box.width) {
      visible = false;
      return;
    }
    ring.style.transition = visible ? '' : 'none';
    ring.style.width = `${box.width}px`;
    ring.style.height = `${box.height}px`;
    ring.style.transform = `translate(${box.left - gridBox.left}px, ${box.top - gridBox.top}px)`;
    ring.classList.add('is-placed');
    visible = true;
  }

  place();
  const mutations = new MutationObserver(place);
  mutations.observe(grid, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked'] });
  const resize = new ResizeObserver(place);
  resize.observe(grid);
  return { destroy() { mutations.disconnect(); resize.disconnect(); } };
}
