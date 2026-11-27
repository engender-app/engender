/* Provide `.at()` for browser targets below Chrome 92 (ADR-0023).
   Android's current WebView 104 floor already provides it. The
   pdf.js legacy build still uses it inside the worker.

   Patch both main and worker realms. Define the methods on all three
   prototypes as non-enumerable so `for...in` sees the same keys. */

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
