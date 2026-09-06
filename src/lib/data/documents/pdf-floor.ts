/* `.at()` for the WebView the app promises to run on (phase 8 features
   ticket 55, ADR-0023).

   The floor is Chrome 87 and `Array.prototype.at` arrived in 92. pdf.js's
   legacy build compiles its own syntax down and carries core-js for
   `Promise.withResolvers` and `Object.hasOwn`, but not for this one - a
   `pattern.at(-1)` sits in the worker's operator-list machinery, so a
   WebView between 87 and 92 would fail on the first page of the first
   document rather than anywhere a person could act on.

   Rewriting the app's own `.at(-1)` calls was the alternative and is what
   happened to them; this exists because a dependency's calls are not ours
   to rewrite. It is imported by both halves of the renderer, since a
   worker is its own realm and gets none of the main thread's patching.

   All three prototypes at once, because they shipped together: a browser
   without one has none of them, and pdf.js reads bytes as well as arrays.
   Written with defineProperty rather than assignment so the method stays
   non-enumerable, which is what keeps a `for...in` over an array from
   finding it. */

function at(this: { length: number; [index: number]: unknown }, index: number): unknown {
  const length = this.length;
  const from = Math.trunc(index) || 0;
  const resolved = from < 0 ? length + from : from;
  return resolved < 0 || resolved >= length ? undefined : this[resolved];
}

const typedArray = Object.getPrototypeOf(Uint8Array.prototype);

for (const prototype of [Array.prototype, String.prototype, typedArray]) {
  if (typeof (prototype as { at?: unknown }).at === 'function') continue;
  Object.defineProperty(prototype, 'at', { value: at, writable: true, configurable: true, enumerable: false });
}

/* Side effects only, but a module all the same: an import of a file with
   no exports is not one TypeScript will type-check the shape of. */
export {};
