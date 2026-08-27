/* The result handshake every probe page and its driving script share
   (ticket 06): a probe sets a result on `window` and a ready attribute on
   `<body>` so the Node script driving Chromium knows when to read it. Both
   ends used to spell the two strings by hand at each of 15 call sites, with
   nothing tying one spelling to the other - this derives both from one
   `name`, so they cannot drift apart. */

/** @param {string} name */
export function readyAttr(name) {
  return `data-${name}-ready`;
}

/** @param {string} name */
export function resultGlobal(name) {
  return `__${name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}Result`;
}

/** Called from a probe page, in the browser: publishes `value` under `name`'s
    result global and marks `name`'s ready attribute on `<body>`, which is
    what a driving script's `load(path, name)` waits on and reads.
    @param {string} name
    @param {unknown} value */
export function publish(name, value) {
  /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window))[resultGlobal(name)] = value;
  document.body.setAttribute(readyAttr(name), '');
}
