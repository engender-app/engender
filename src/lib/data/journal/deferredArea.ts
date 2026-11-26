/* Defer large journal areas until first use without changing the facade's
   static type (ADR-0017). Opening Home then need not parse the Archive
   pack/apply pipeline; writes.ts still checks the real interface.

   writes.ts walks Object.entries(area) at boot, before import() resolves,
   so the facade exposes its method names up front. The missing type check
   requires every name, and deferredArea.test.ts compares runtime keys
   against the eager area. Use this wrapper for areas that justify a split. */

/** The names of an area's callable members, and only those - the same shape
    writes.ts's `Operation` picks out, and for the same reason. An area
    carrying a data member would otherwise be listable here, and the facade
    would hand back an async function where the eager area held a value,
    which is exactly the case `observeWrites` passes through untouched. */
type Method<Area> = Extract<
  { [K in keyof Area]: Area[K] extends (...args: never[]) => unknown ? K : never }[keyof Area],
  string
>;

/**
 * A facade over `load`'s area, offering `methods` and resolving the
 * implementation on the first call to any of them.
 *
 * Curried so the area's type is fixed before the names are checked against
 * it: `deferredArea<ArchiveArea>(load)(['getArchive'])`. A name the
 * interface does not have is rejected by `Names`; one it has and the list
 * does not arrives as a required `missing` property naming it, which is the
 * only way to get TypeScript to say *which* method was forgotten - the same
 * trick writes.ts's `classify` plays for the same reason.
 */
export function deferredArea<Area extends object>(load: () => Promise<Area>) {
  return <const Names extends readonly Method<Area>[]>(
    methods: Names &
      (Exclude<Method<Area>, Names[number]> extends never
        ? unknown
        : { missing: Exclude<Method<Area>, Names[number]> })
  ): Area => {
    /* The area rather than the import is what is remembered here. A repeated
       `import()` of one specifier already resolves from the module loader's
       own cache, but calling the factory twice would hand back a second area
       with empty caches. Cleared when the load rejects so the next call runs `load()`
       again rather than holding a rejected promise for the life of the tab.
       Chromium caches a failed dynamic `import()`, so a retry through the
       same specifier may not refetch the chunk; this only stops the failure
       being remembered here. */
    let pending: Promise<Area> | undefined;
    const area = () =>
      (pending ??= load().catch((error: unknown) => {
        pending = undefined;
        throw error;
      }));

    const facade: Record<string, unknown> = {};
    for (const name of methods as readonly string[]) {
      facade[name] = async (...args: unknown[]) => {
        const resolved = (await area()) as Record<string, (...args: unknown[]) => unknown>;
        return resolved[name](...args);
      };
    }
    return facade as Area;
  };
}
