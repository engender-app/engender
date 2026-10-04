/* Contiguous groups keep intentional write/read sequences in one journal.
   Starting states and the hosted timing baseline are documented in PROBES.md. */
export const WALKTHROUGH_GROUPS = [
  { id: 'journal', first: 'quick log', last: 'plain export', state: 'alice' },
  { id: 'setup', first: 'onboarding', last: 'measurements protocol notice dedup and dismiss persistence', state: 'alice' },
  { id: 'features', first: 'demo bar state jump overlap', last: 'span offer', state: 'alice' },
  { id: 'actions', first: 'quick add mood', last: 'the recovery key at the gate', state: 'full' }
];

/** @param {string[]} names @param {string} id */
export function groupFlows(names, id) {
  const group = WALKTHROUGH_GROUPS.find((group) => group.id === id);
  if (!group) throw new Error(`Unknown walkthrough group: ${id}`);
  const first = names.indexOf(group.first);
  const last = names.indexOf(group.last);
  if (first < 0 || last < first) throw new Error(`Missing walkthrough boundaries: ${id}`);
  return names.slice(first, last + 1);
}
