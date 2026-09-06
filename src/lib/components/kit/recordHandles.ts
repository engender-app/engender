/* The walkthrough vocabulary a record sheet stamps (ADR-0029, phase 5 audit
   ticket 09).

   Twenty-nine save-and-delete button pairs across sixteen screens carried
   twenty-two distinct save handles, each spelled out by hand beside its
   button, and the confirm handle a third time in the delete sheet's props.
   Three of them had drifted off the pattern the other nineteen followed.
   A screen names its record once now - `handle="wear-session"` - and the
   three attributes come from here.

   Rune-free and node-tested for the reason readGate.ts and recordEditor.ts
   are: this is the rule, RecordSheet.svelte is the rendering of it.
   `recordHandleSlug` is the way back, so tests/walkthrough-handles-exist.ts
   can resolve a generated handle to the slug a screen wrote. */

/* Longest first, so `data-confirm-delete-lab` is never read as a delete
   handle for a record called `confirm`. */
const PREFIXES = ['data-confirm-delete-', 'data-delete-', 'data-save-'] as const;

type RecordHandles = {
  /** The editor sheet's primary button. */
  save: string;
  /** The editor sheet's delete button, which opens the confirm sheet. */
  delete: string;
  /** The confirm sheet's danger button, beside the kit's own
      `data-confirm-delete`. */
  confirm: string;
};

const SLUG = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** The three handles for a record named `slug`, e.g. `wear-session`.

    Throws rather than generating something unreachable: a handle is only
    worth anything if the walkthrough can predict it, and a slug that
    already says `save` or `data` produces a name no flow would guess. */
export function recordHandles(slug: string): RecordHandles {
  if (!SLUG.test(slug)) throw new Error(`a record handle is a kebab-case name, not ${JSON.stringify(slug)}`);
  if (/^(data|save|delete|confirm)-/.test(slug)) {
    throw new Error(`a record handle names the record, not the action: ${JSON.stringify(slug)}`);
  }
  return {
    save: `data-save-${slug}`,
    delete: `data-delete-${slug}`,
    confirm: `data-confirm-delete-${slug}`
  };
}

/** The slug behind a generated handle, or null if no record sheet could
    have produced it. */
/* recordHandleSlug stays exported for its own test, and cross-checked in
   walkthrough-handles-exist.test.ts (AU-09 test-only review). */
export function recordHandleSlug(handle: string): string | null {
  for (const prefix of PREFIXES) {
    if (!handle.startsWith(prefix)) continue;
    const slug = handle.slice(prefix.length);
    if (SLUG.test(slug)) return slug;
  }
  return null;
}
