/* Mounting a real component in this tier, for the two things pages here do
   with one (phase 8 audit ticket 25).

   Five gallery pages already mounted a component and stamped a ready
   attribute by hand, each spelling the attribute out as a string beside a
   `name` that probe-handshake.mjs derives the same string from. They were
   built to be photographed, so a published result was never part of the
   shape - and that is why the app's largest concentration of branching sits
   behind grep tests: there was no way to mount a screen, drive it, and
   answer with a value.

   `mountFixture` is that shape: a component, its props, and a result the
   driving script reads under the page's own name. A page with nothing to
   answer (a gallery) omits `result` and gets the ready attribute alone,
   which is exactly what it stamped before.

   `mountScreen` underneath it is the mount on its own, for a probe that
   mounts the same screen several times over - one per case - and answers
   once at the end.

   Nothing here argues with ADR-0016. That rule keeps the *Node* tier away
   from paraglide; this tier runs the real bundle in a real browser, so a
   component's own message calls resolve the way they do in the app. */
import { mount, unmount, type Component } from 'svelte';
import { publish } from '../probe-handshake.mjs';

/** Mounts `component` into `target`, which it does not wrap: a gallery's
    stylesheet is authored against the page's own container, and an extra
    div between the two would be a difference the fixture invented. */
export function mountScreen<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: Props,
  target: Element
): { remove: () => Promise<void> } {
  const instance = mount(component, { target, props });
  return { remove: () => unmount(instance, { outro: false }) };
}

/** Mounts `component` and publishes `result`'s answer under `name`, which
    `run.mjs`'s `load(path, name)` waits on and reads.

    Both the mount and the result are guarded: a component that throws on
    mount would otherwise never publish at all, and the driving script would
    read that as an anonymous 30-second timeout rather than as the error it
    is. */
export function mountFixture<Props extends Record<string, unknown>>(
  name: string,
  component: Component<Props>,
  options: {
    props?: Props;
    /** Defaults to `#${name}`. */
    target?: string;
    result?: () => unknown | Promise<unknown>;
  } = {}
): void {
  const selector = options.target ?? `#${name}`;
  const run = async () => {
    const target = document.querySelector(selector);
    if (!target) throw new Error(`no element matches ${selector}`);
    mountScreen(component, options.props ?? ({} as Props), target);
    return options.result ? await options.result() : undefined;
  };
  run().then(
    (value) => publish(name, value),
    (error: unknown) => publish(name, { error: String((error as Error)?.stack ?? error) })
  );
}
