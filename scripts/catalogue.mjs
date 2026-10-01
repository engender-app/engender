/* The one writer for messages/en.json and messages/pl.json (phase 12
   copy-tooling ticket 01). Keys go in sorted order so a new key lands beside
   its own prefix instead of at the end of the file, where every parallel
   branch appends and collides. `$schema` stays first, as the inlang tooling
   expects. Anything that writes a catalogue imports this rather than
   calling JSON.stringify itself. */

/**
 * Code-unit order, not locale order: it is the same on every machine, so two
 * branches that sort the same keys produce the same bytes.
 *
 * @param {Record<string, unknown>} catalogue
 * @returns {string} the file's text, trailing newline included
 */
export function serializeCatalogue(catalogue) {
  const { $schema, ...messages } = catalogue;
  /** @type {Record<string, unknown>} */
  const ordered = {};
  if ($schema !== undefined) ordered.$schema = $schema;
  for (const key of Object.keys(messages).sort()) ordered[key] = messages[key];
  return JSON.stringify(ordered, null, 2) + '\n';
}

/**
 * @param {string} text a catalogue file's contents
 * @returns {boolean} whether it is exactly what serializeCatalogue would write
 */
export function isSerialized(text) {
  return serializeCatalogue(JSON.parse(text)) === text;
}
