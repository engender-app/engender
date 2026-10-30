/* Functional-audit ticket 39, rendered: the side-effects part files each
   effect under the heading its resolved day says, and the changes noticed
   print with their first-noticed dates. Mounted rather than read as source,
   because what a clinician is handed is the heading a row sits under. */
import { flushSync, mount, unmount } from 'svelte';
import ClinicianSummaryDossier from '../../src/lib/components/ClinicianSummaryDossier.svelte';
import type { ClinicianSummary } from '../../src/lib/data/journal/clinicianSummary';
import { publish } from '../probe-handshake.mjs';

const cases: { name: string; passed: boolean; error?: string }[] = [];
const empty: ClinicianSummary['sections'] = {
  demographics: null,
  regimen: null,
  exposure: null,
  labs: null,
  sideEffects: null,
  personalEffects: null,
  cycleEvents: null,
  appointmentPrep: null,
  procedures: null,
  finishedAreas: null
};

async function check(name: string, sections: Partial<ClinicianSummary['sections']>, test: (root: HTMLElement) => boolean) {
  const target = document.createElement('div');
  document.body.append(target);
  try {
    const summary = { fromEpochDay: 20000, toEpochDay: 20030, generatedAtEpochDay: 20030, sections: { ...empty, ...sections } };
    const instance = mount(ClinicianSummaryDossier, { target, props: { summary } });
    flushSync();
    cases.push({ name, passed: test(target) });
    await unmount(instance);
  } catch (error) {
    cases.push({ name, passed: false, error: String(error) });
  } finally {
    target.remove();
  }
}

/** The text of the nearest heading above the row that names `text`. */
function headingAbove(root: HTMLElement, text: string): string | null {
  const row = [...root.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(text));
  if (!row) return null;
  const headings = [...root.querySelectorAll('h2, h3')];
  const above = headings.filter((h) => h.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
  return above.at(-1)?.textContent?.trim() ?? null;
}

await check(
  'a resolved side effect sits under "Resolved", an ongoing one under "Ongoing", and no heading says "active"',
  {
    sideEffects: [
      { id: 'a', name: 'still going', severity: 2, epochDay: 19990, resolvedEpochDay: null },
      { id: 'b', name: 'over now', severity: 3, epochDay: 20005, resolvedEpochDay: 20012 }
    ]
  },
  (root) =>
    headingAbove(root, 'still going') === 'Ongoing' &&
    headingAbove(root, 'over now') === 'Resolved' &&
    ![...root.querySelectorAll('h2, h3')].some((h) => /active/i.test(h.textContent ?? ''))
);

await check(
  'the changes noticed print each change with its first-noticed date, a custom one under its own name',
  {
    personalEffects: [
      { effect: 'own', name: 'Rings fit looser', builtIn: false, firstNoticedEpochDay: 19900 },
      { effect: 'breast_development', name: '', builtIn: true, firstNoticedEpochDay: 19950 }
    ]
  },
  (root) => {
    const rows = [...root.querySelectorAll('[data-dossier-section="personalEffects"] tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim() ?? '')
    );
    return (
      rows.length === 2 &&
      rows[0][1] === 'Rings fit looser' &&
      /\d{4}/.test(rows[0][0]) &&
      rows[1][1].length > 0 &&
      rows[1][1] !== 'breast_development'
    );
  }
);

publish('clinician-summary-dossier', { cases });
