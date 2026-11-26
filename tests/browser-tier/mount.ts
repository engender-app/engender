/* Mount real browser-tier components with their message runtime
   (ADR-0016 keeps only Node away from Paraglide). publishFixture
   publishes under the name probe-handshake.mjs expects. A gallery
   returns undefined for readiness only. A probe returns its measured
   result after interacting. */
import { mount, unmount, type Component } from 'svelte';
import { publish } from '../probe-handshake.mjs';

/** Mounts `component` into `target`, which is the caller's to choose and to
    empty: a gallery hands over the container its own stylesheet is authored
    against, and a probe that mounts the same screen once per case hands over
    a fresh element each time. */
export function mountInto<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: Props,
  target: Element
): { remove: (outro?: boolean) => Promise<void> } {
  const instance = mount(component, { target, props });
  return { remove: (outro = false) => unmount(instance, { outro }) };
}

/** Runs `work` and publishes its answer under `name`, which `run.mjs`'s
    `load(path, name)` waits on and reads.

    Guarded, which is the point of every page going through here: work that
    throws - a component that will not mount, a click that never lands -
    publishes the error, where before it published nothing at all and the
    driving script read that as an anonymous 30-second timeout. */
export function publishFixture(name: string, work: () => unknown): void {
  Promise.resolve()
    .then(work)
    .then(
      (value) => publish(name, value),
      (error: unknown) => publish(name, { error: String((error as Error)?.stack ?? error) })
    );
}
