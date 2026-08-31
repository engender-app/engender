import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { journalWithBuiltIns } from '../src/lib/data/journal/test-support.ts';
import { procedurePhase, recoveryDay } from '../src/lib/data/recoveryDay.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

describe('Procedure Care & Recovery Hub (Ticket 12)', () => {
  it('derives the 5 lifecycle phases accurately', () => {
    const today = 20000;
    expect(procedurePhase(null, today)).toBe('planning');
    expect(procedurePhase(20010, today)).toBe('pre_op');
    expect(procedurePhase(20000, today)).toBe('surgery_day');
    expect(procedurePhase(19986, today)).toBe('recovery'); // 14 days post-op
    expect(procedurePhase(19910, today)).toBe('recovery'); // 90 days post-op
    expect(procedurePhase(19909, today)).toBe('archived'); // 91 days post-op
  });

  it('ProcedureRecoveryCard component contains required accessibility, role and phase hooks', () => {
    const cardCode = read('src/lib/components/ProcedureRecoveryCard.svelte');
    expect(cardCode).toContain('data-procedure-card');
    expect(cardCode).toContain('data-phase');
    expect(cardCode).toContain('data-phase-pill');
    expect(cardCode).toContain('proc-phase-icon');
    expect(cardCode).toContain('data-linked-milestone');
    expect(cardCode).toContain('data-edit-procedure');
  });

  it('surgery page implements all 4 active lifecycle sections and prompt for milestone on surgery day', () => {
    const pageCode = read('src/routes/settings/surgery/+page.svelte');
    expect(pageCode).toContain('data-recovery-log');
    expect(pageCode).toContain('data-phase');
    expect(pageCode).toContain('data-record-milestone-prompt');
    expect(pageCode).toContain('data-confirm-record-milestone');
    expect(pageCode).toContain('PhotoSection');
    expect(pageCode).toContain('ProcedureRecoveryCard');
    expect(pageCode).toContain('data-add-procedure-item');
    expect(pageCode).toContain('data-add-consult');
    expect(pageCode).toContain('data-save-notes');
  });

  it('supports full lifecycle data flow with atomic milestone linking', async () => {
    const { journal } = await journalWithBuiltIns();

    // 1. Planning phase (no date)
    const procId = await journal.procedures.upsertProcedure({
      name: 'Top Surgery',
      notes: 'Consult questions: recovery time, compression garment'
    });

    let [proc] = await journal.procedures.getProcedures();
    expect(proc.id).toBe(procId);
    expect(procedurePhase(proc.surgeryEpochDay, 20000)).toBe('planning');

    // Add consult and prep checklist
    await journal.procedures.addConsult(procId, 19980);
    await journal.procedures.addChecklistItem(procId, 'Book consultation appointment');
    await journal.procedures.addChecklistItem(procId, 'Gather insurance documentation');

    let checklist = await journal.procedures.getChecklist(procId);
    expect(checklist?.items).toHaveLength(2);

    // 2. Pre-Op phase (scheduled 30 days ahead)
    await journal.procedures.upsertProcedure({
      id: procId,
      name: 'Top Surgery',
      surgeryEpochDay: 20030
    });

    [proc] = await journal.procedures.getProcedures();
    expect(procedurePhase(proc.surgeryEpochDay, 20000)).toBe('pre_op');
    const preOpRec = recoveryDay(proc.surgeryEpochDay, 20000);
    expect(preOpRec.type).toBe('upcoming');
    if (preOpRec.type === 'upcoming') {
      expect(preOpRec.days).toBe(30);
    }

    // 3. Surgery Day phase (prompting milestone creation ADR-0045)
    expect(procedurePhase(proc.surgeryEpochDay, 20030)).toBe('surgery_day');
    expect(await journal.procedures.getMilestone(procId)).toBeNull();

    // Explicit confirmation creates transition milestone
    const milestoneId = await journal.procedures.recordSurgeryMilestone(procId);
    expect(milestoneId).toBeDefined();

    const linked = await journal.procedures.getMilestone(procId);
    expect(linked).toBeDefined();
    expect(linked?.name).toBe('Top Surgery');
    expect(linked?.epochDay).toBe(20030);
    expect(linked?.procedureId).toBe(procId);

    // 4. Recovery phase (14 days post-op)
    expect(procedurePhase(proc.surgeryEpochDay, 20044)).toBe('recovery');
    const recDay = recoveryDay(proc.surgeryEpochDay, 20044);
    expect(recDay.type).toBe('since');
    if (recDay.type === 'since') {
      expect(recDay.days).toBe(14);
    }

    // Recovery diary & encrypted photos
    await journal.procedures.setNotes(procId, 'Day 14: Drains removed yesterday, swelling decreasing.');
    const photoId = await journal.procedures.addPhoto(procId, 20044, {
      full: new Uint8Array([10, 20, 30]),
      thumb: new Uint8Array([10])
    });
    expect(photoId).toBeDefined();

    const photos = await journal.procedures.getPhotos(procId);
    expect(photos).toHaveLength(1);
    expect(photos[0].epochDay).toBe(20044);

    // 5. Archived phase (>90 days post-op)
    expect(procedurePhase(proc.surgeryEpochDay, 20150)).toBe('archived');
  });
});
