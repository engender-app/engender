export function isDoorActive(node: Element): boolean {
  return node.closest?.('[data-retained-door]')?.hasAttribute('data-retained-active') ?? true;
}

export const ACTIVE_DOOR_CONTENT = ':not([data-retained-door]:not([data-retained-active]) *)';
