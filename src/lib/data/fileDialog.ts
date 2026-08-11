/* Asking the browser for files. One function, used by the photo picker
   (photos/picker.ts) and the archive picker (archive/pick.ts), because the
   awkward parts are the same for both: an input has to be in the document to
   be clickable, and a dismissed dialog fires `cancel` rather than `change`,
   without which the promise never settles and whatever is waiting on it waits
   forever.

   Web only, and deliberately not an interface. Android reaches its own
   pickers through the shell, which is why each caller keeps a seam of its
   own - this is the web half of both. */

export async function chooseFiles(accept: string, options: { multiple?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    // A hint to the dialog, never a guarantee: what a file actually is gets
    // decided by reading it.
    input.accept = accept;
    input.multiple = options.multiple ?? false;

    const done = (result: File[] | Error) => {
      input.remove();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    input.addEventListener('change', () => done([...(input.files ?? [])]));
    input.addEventListener('cancel', () => done([]));

    input.style.display = 'none';
    document.body.append(input);
    input.click();
  });
}
