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
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const done = (result: File[] | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocusReturn);
      input.remove();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    input.addEventListener('change', () => done([...(input.files ?? [])]));
    input.addEventListener('cancel', () => done([]));

    // Focus can return before Chromium delivers `change`. Give the files
    // time to arrive before treating an empty picker as a cancellation.
    const onFocusReturn = () => {
      window.removeEventListener('focus', onFocusReturn);
      focusTimer = setTimeout(() => done([...(input.files ?? [])]), 500);
    };
    window.addEventListener('focus', onFocusReturn);

    input.style.display = 'none';
    document.body.append(input);
    input.click();
  });
}
