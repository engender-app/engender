import { nextRadioIndex } from './rovingRadioIndex';

/** Keyboard selection for custom radio buttons. Pointer clicks keep the
    caller's optional click-to-clear behavior.

    `selectOnArrow: false` is for a group whose pick goes somewhere: Today's
    mood faces open the editor, so selecting on arrow threw a keyboard user
    into the editor on the first face they passed (WCAG 3.2.2, audit
    A11Y-02). There an arrow moves focus and the group's one Tab stop with
    it, and Space or Enter commits. */
export function rovingRadio(group: HTMLElement, options: { selectOnArrow?: boolean } = {}) {
  const selectOnArrow = options.selectOnArrow ?? true;
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
    if (!selectOnArrow && next !== null) {
      for (const radio of radios()) radio.tabIndex = radio === target ? 0 : -1;
      target.focus();
      return;
    }
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
