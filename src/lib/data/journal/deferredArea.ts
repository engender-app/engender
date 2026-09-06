/* An area whose implementation arrives the first time something asks for it
   (phase 9 audit ticket 03).

   journal.ts composes the whole journal in one call, which is what lets
   live/writes.ts classify every method by walking the object and what lets a
   screen name any area without knowing how it was built (ADR-0017). The cost
   is that composing is also a static import: opening Home parsed the
   pharmacokinetics of injectable esters and the whole archive pack/apply
   pipeline on the way to a greeting, about 9,100 lines of code no first
   screen runs.

   A deferred area keeps the facade exactly as it was above the seam. Its
   type is still static, so nothing above changes and writes.ts still checks
   the real interface; only the implementation is behind an `import()`, the
   same shape sqlite/boot.ts uses for migrations.ts and archive.ts uses for
   restore.ts.

   THE LIST OF NAMES is the price. writes.ts walks `Object.entries(area)` at
   boot to build its wrapper, so a deferred area has to present its method
   names before its module exists, and no type survives to runtime to supply
   them. Two things keep the list honest: the call site is a compile error
   when a method is missing from it (`missing` below), and
   deferredArea.test.ts compares each deferred facade's keys against the
   eager area's, so a name that drifts fails a test rather than a screen.

   NOT A GENERAL WRAPPER for the other forty-odd areas. Most are a few
   hundred lines and splitting them all would trade one clear module for
   fifty lazy ones and a list of names each - the ticket's own "out of
   scope". This is for the few that carry real weight. */

/**
 * A facade over `load`'s area, offering `methods` and resolving the
 * implementation on the first call to any of them.
 *
 * Curried so the area's type is fixed before the names are checked against
 * it: `deferredArea<HormoneCurveArea>(load)(['getCurves'])`. A name the
 * interface does not have is rejected by `Names`; one it has and the list
 * does not arrives as a required `missing` property naming it, which is the
 * only way to get TypeScript to say *which* method was forgotten - the same
 * trick writes.ts's `classify` plays for the same reason.
 */
export function deferredArea<Area extends object>(load: () => Promise<Area>) {
  return <const Names extends readonly (keyof Area & string)[]>(
    methods: Names &
      (Exclude<keyof Area & string, Names[number]> extends never
        ? unknown
        : { missing: Exclude<keyof Area & string, Names[number]> })
  ): Area => {
    /* The area rather than the import is what is remembered here. A repeated
       `import()` of one specifier already resolves from the module loader's
       own cache, but calling the factory twice would hand back a second area
       with empty caches, and hormoneCurve's two model memos (ticket 04) are
       exactly that. Cleared when the load rejects so a chunk that failed to
       arrive once - an old service worker, a dropped connection - is asked
       for again rather than remembered as broken for the life of the tab. */
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
