import { nextRadioIndex } from './rovingRadioIndex';

/** Keyboard selection for custom radio buttons. Pointer clicks keep the
    caller's optional click-to-clear behavior. */
export function rovingRadio(group: HTMLElement) {
  const radios = () => Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'))
    .filter(radio => radio.closest('[role="radiogroup"]') === group);
  const enabled = (radio: HTMLElement) => !radio.matches(':disabled, [aria-disabled="true"]');

  function sync() {
    const options = radios();
    const active = options.find(radio => enabled(radio) && radio.getAttribute('aria-checked') === 'true')
      ?? options.find(enabled);
    for (const radio of options) radio.tabIndex = radio === active ? 0 : -1;
  }

  function keydown(event: KeyboardEvent) {
    const options = radios().filter(enabled);
    const current = options.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    const next = nextRadioIndex(event.key, current, options.length);
    if (next === null && event.key !== ' ') return;
    event.preventDefault();
    const target = options[next ?? current];
    target.focus();
    if (target.getAttribute('aria-checked') !== 'true') target.click();
  }

  sync();
  const observer = new MutationObserver(sync);
  observer.observe(group, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['aria-checked', 'aria-disabled', 'disabled'] });
  group.addEventListener('keydown', keydown);
  return { destroy() { observer.disconnect(); group.removeEventListener('keydown', keydown); } };
}
