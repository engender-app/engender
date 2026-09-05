/* Mounting a real component in this tier, for the two things pages here do
   with one (phase 8 audit ticket 25).

   Five gallery pages already mounted a component and stamped a ready
   attribute by hand, each spelling the attribute out as a string beside a
   `name` that probe-handshake.mjs derives the same string from. They were
   built to be photographed, so a published result was never part of the
   shape - and that is why the app's largest concentration of branching sits
   behind grep tests: there was no way to mount a screen, drive it, and
   answer with a value.

   `publishFixture` is that shape: whatever the page does, published under
   the page's own name. A gallery's work is a mount and nothing else, so it
   answers `undefined` and the driving script gets the ready attribute alone,
   exactly what it had. A probe's work is a mount, some clicks and a read,
   and it answers with the read.

   Nothing here argues with ADR-0016. That rule keeps the *Node* tier away
   from paraglide; this tier runs the real bundle in a real browser, so a
   component's own message calls resolve the way they do in the app. */
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
): { remove: () => Promise<void> } {
  const instance = mount(component, { target, props });
  return { remove: () => unmount(instance, { outro: false }) };
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
