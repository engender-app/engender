/* Which input the last focus came from, so a text field can drop its focus ring for a
   finger or a mouse and keep it for a keyboard.

   Chromium's:focus-visible matches a text field on every focus, tap included, so the global
   ring (components.css) drew a 2px frame around each textbar the moment it was pressed. The
   platform has no signal for "this focus came from a pointer" that a field respects, so
   this sets one: a press marks the document `data-input="pointer"`, and Tab clears it.
   Typing does not clear it - a person who tapped a field and is now typing is still not a
   keyboard navigator. Before any press the attribute is absent, so a keyboard or
   screen-reader arrival keeps its ring. */

export function trackPointerFocus(doc: Document = document): () => void {
  const root = doc.documentElement;
  const onPointer = () => { root.dataset.input = 'pointer'; };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Tab') delete root.dataset.input; };
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('keydown', onKey, true);
  return () => {
    doc.removeEventListener('pointerdown', onPointer, true);
    doc.removeEventListener('keydown', onKey, true);
  };
}
