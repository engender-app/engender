/* What the app says after it writes a kept Taken or Skip tap into the
   journal. One toast per tap, longer than the
   default four seconds because it arrives on unlock, while the person is
   still finding their place, and a logged dose offers its record: an
   injection logged from a notification has no site yet. */

import { m } from '$lib/paraglide/messages';
import { toast } from '$lib/stores/toasts.svelte';
import type { DoseActionOutcome } from './doseActions';

export function confirmDoseAction(outcome: DoseActionOutcome, open: (href: string) => void): void {
  const { drug } = outcome;
  switch (outcome.result) {
    case 'logged':
      toast(outcome.action === 'taken' ? m.dose_reminder_taken({ drug }) : m.dose_reminder_skipped({ drug }), {
        kind: 'dose-reminder-logged',
        duration: 6000,
        actionLabel: m.prov_open_source(),
        onAction: () => open(`/care/doses?dose=${outcome.doseId}`)
      });
      return;
    case 'already':
      toast(m.dose_reminder_already({ drug }), { kind: 'dose-reminder-already', duration: 6000 });
      return;
    case 'nothingDue':
      toast(m.dose_reminder_nothing_due({ drug }), { kind: 'dose-reminder-nothing-due', duration: 6000 });
      return;
    case 'noRegimen':
      toast(m.dose_reminder_no_regimen({ drug }), { kind: 'dose-reminder-no-regimen', duration: 6000 });
      return;
    case 'multipleRegimens':
      toast(m.dose_reminder_multiple_regimens({ drug }), { kind: 'dose-reminder-multiple-regimens', duration: 6000 });
  }
}
