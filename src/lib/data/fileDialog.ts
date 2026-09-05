/* Asking the browser for files. One function, used by the photo picker
   (photos/picker.ts) and the archive picker (archive/pick.ts), because the
   awkward parts are the same for both: an input has to be in the document to
   be clickable, and a dismissed dialog fires `cancel` rather than `change`,
   without which the promise never settles and whatever is waiting on it waits
   forever.

   Web only, and deliberately not an interface. Android reaches its own
   pickers through the shell, which is why each caller keeps a seam of its
   own - this is the web half of both. */

export async function chooseFiles(
  accept: string,
  options: { multiple?: boolean; capture?: 'user' | 'environment' } = {}
): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    // A hint to the dialog, never a guarantee: what a file actually is gets
    // decided by reading it.
    input.accept = accept;
    input.multiple = options.multiple ?? false;
    if (options.capture) input.capture = options.capture;

    let settled = false;
    const done = (result: File[] | Error) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocusReturn);
      input.remove();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    input.addEventListener('change', () => done([...(input.files ?? [])]));
    input.addEventListener('cancel', () => done([]));

    // Ticket 66: the native picker can be torn down without ever firing
    // `change` or `cancel` (that ticket's own bug did exactly this, on the
    // Android side, before either event had a chance to fire). The window
    // only regains focus once the native picker is gone either way, so if
    // neither event has settled the promise by the next tick after focus
    // returns, nothing more is coming - resolve empty, the same outcome a
    // cancel produces, rather than leave the caller waiting forever.
    const onFocusReturn = () => {
      window.removeEventListener('focus', onFocusReturn);
      setTimeout(() => done([]), 0);
    };
    window.addEventListener('focus', onFocusReturn);

    input.style.display = 'none';
    document.body.append(input);
    input.click();
  });
}
