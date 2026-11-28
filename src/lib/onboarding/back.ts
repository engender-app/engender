/* Setup owns its draft and its transitions. Native Back delegates to that
   mounted owner rather than navigating away and mounting an empty draft. */
let owner: (() => boolean) | undefined;

export function registerSetupBack(back: () => boolean): () => void {
  owner = back;
  return () => {
    if (owner === back) owner = undefined;
  };
}

export function setupBack(): boolean {
  return owner?.() ?? false;
}
