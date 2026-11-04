import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { journalWithBuiltIns } from '../src/lib/data/journal/test-support.ts';
import { procedurePhase, recoveryDay } from '../src/lib/data/recoveryDay.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const PROCEDURE_SCREEN = 'src/routes/health/surgery/[id]/+page.svelte';

describe('Procedure Care & Recovery Hub (Ticket 12)', () => {
  it('derives the 5 lifecycle phases accurately', () => {
    const today = 20000;
    expect(procedurePhase(null, today)).toBe('planning');
    expect(procedurePhase(20010, today)).toBe('pre_op');
    expect(procedurePhase(20000, today)).toBe('surgery_day');
    expect(procedurePhase(19986, today)).toBe('recovery'); // 14 days post-op
    expect(procedurePhase(19910, today)).toBe('recovery'); // 90 days post-op
    expect(procedurePhase(19880, today)).toBe('recovery'); // 120 days post-op, not archived
    expect(procedurePhase(19880, today, true)).toBe('archived'); // archived by the person
  });

  it('ProcedureRecoveryCard component contains required accessibility, role and phase hooks', () => {
    const cardCode = read('src/lib/components/ProcedureRecoveryCard.svelte');
    expect(cardCode).toContain('data-procedure-card');
    expect(cardCode).toContain('data-phase');
    expect(cardCode).toContain('data-phase-pill');
    expect(cardCode).toContain('data-linked-milestone');
    expect(cardCode).toContain('data-open-procedure');
    // Ticket 52: the reading is the number on the card and the journey is
    // the rail beside it, so both are hooks a probe can find.
    expect(cardCode).toContain('data-procedure-reading');
    expect(cardCode).toContain('data-procedure-strip');
    expect(cardCode).toContain('ProcedurePhaseRail');
  });

  it('an archived card draws no phase pill, since its heading already says Archived', () => {
    const cardCode = read('src/lib/components/ProcedureRecoveryCard.svelte');
    expect(cardCode).toMatch(/\{#if phase !== 'archived'\}\s*<span class="kit-pill proc-phase-pill"/);
  });

  it('the procedure screen implements all 4 active lifecycle sections and prompt for milestone on surgery day', () => {
    const pageCode = read(PROCEDURE_SCREEN);
    expect(pageCode).toContain('data-recovery-log');
    expect(pageCode).toContain('data-phase');
    expect(pageCode).toContain('data-record-milestone-prompt');
    expect(pageCode).toContain('data-confirm-record-milestone');
    expect(pageCode).toContain('PhotoSection');
    expect(read('src/routes/health/surgery/+page.svelte')).toContain('ProcedureRecoveryCard');
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

    // 5. Still recovery 120 days on: only the person's switch archives it
    expect(procedurePhase(proc.surgeryEpochDay, 20150, proc.archived)).toBe('recovery');
    await journal.procedures.upsertProcedure({ id: procId, name: 'Top Surgery', surgeryEpochDay: 20030, archived: true });
    [proc] = await journal.procedures.getProcedures();
    expect(procedurePhase(proc.surgeryEpochDay, 20150, proc.archived)).toBe('archived');
  });

  /* Functional-audit ticket 24: the one notes field and the one checklist
     used to be retitled by phase ("Consult questions & notes", "Recovery
     feelings diary", "Clearance & packing list" and four more), which made
     one field look like five. */
  it('shows one Notes and one Checklist in every phase', () => {
    const pageCode = read(PROCEDURE_SCREEN);
    const notes = [...pageCode.matchAll(/\{@render notesBlock\(([^)]*)\)\}/g)].map((match) => match[1]);
    const checklists = [...pageCode.matchAll(/\{@render checklistBlock\(([^)]*)\)\}/g)].map((match) => match[1]);
    expect(notes).toEqual(['', '', '', '', '']);
    expect(checklists).toEqual(['', '', '', '', 'true']);
    expect(pageCode).toMatch(/<SectionHeading text=\{m\.surgery_notes_title\(\)\} \/>/);
    expect(pageCode).toMatch(/<SectionHeading text=\{m\.surgery_checklist_title\(\)\} \/>/);
    for (const lang of ['en', 'pl']) {
      const messages = JSON.parse(read(`messages/${lang}.json`)) as Record<string, string>;
      for (const retired of [
        'surgery_consult_questions_title', 'surgery_feelings_title', 'surgery_feelings_placeholder',
        'surgery_prep_checklist_title', 'surgery_clearance_checklist_title', 'surgery_recovery_checklist_title'
      ]) expect(messages[retired], `${lang} ${retired}`).toBeUndefined();
    }
    expect(JSON.parse(read('messages/en.json')).surgery_notes_title).toBe('Notes');
    expect(JSON.parse(read('messages/en.json')).surgery_checklist_title).toBe('Checklist');
  });

  /* prh12 bug 18: the kind used to default to Custom and sit in a static
     row with a small pencil, so nothing said a type was to be chosen. */
  it('asks for a procedure type on a new procedure and will not save without one', () => {
    const pageCode = read('src/routes/health/surgery/+page.svelte');
    expect(pageCode).toMatch(/blank: \(\) => \(\{[^}]*kind: null/);
    expect(pageCode).toMatch(/canSave=\{\(draft\) => draft\.kind !== null && /);
    expect(read('src/lib/components/ProcedureFields.svelte')).toMatch(/title=\{kind \? procedureKindName\(kind\) : m\.surgery_kind_choose\(\)\}/);
    for (const lang of ['en', 'pl']) {
      const messages = JSON.parse(read(`messages/${lang}.json`)) as Record<string, string>;
      expect(messages.surgery_kind_choose, lang).toBeTruthy();
      expect(messages.surgery_kind_needed, lang).toBeTruthy();
    }
  });

  /* prh12 bug 20: a procedure opens its own screen rather than sliding its
     log open under the list, and its facts are edited there in place. */
  it('opens each procedure on its own screen, with its facts editable there', () => {
    const cardCode = read('src/lib/components/ProcedureRecoveryCard.svelte');
    expect(cardCode).toMatch(/<a\s+class="proc-face"\s+href="\/health\/surgery\/\{procedure\.id\}"/);
    expect(cardCode).not.toContain('aria-expanded');
    const listCode = read('src/routes/health/surgery/+page.svelte');
    expect(listCode).not.toContain('data-recovery-log');
    expect(listCode).not.toContain('selectedId');
    const screenCode = read(PROCEDURE_SCREEN);
    expect(screenCode).toContain('detailDraft<Procedure');
    expect(screenCode).toContain('<ProcedureFields');
    expect(screenCode).toContain('showArchive');
    expect(screenCode).toContain('data-save-procedure');
    expect(screenCode).toContain('data-delete-procedure');
    expect(screenCode).toContain('<DiscardSheet guard={detail.guard} />');
  });

  it('sends a consult question to the appointment prep list, not the procedure notes', async () => {
    const pageCode = read(PROCEDURE_SCREEN);
    expect(pageCode).toContain('data-add-consult-question');
    expect(pageCode).toMatch(/journal\.checklists\.addToStandaloneChecklist\(/);

    // The list the surgery screen writes to is the one the appointment
    // screen reads as its prep list.
    const { journal } = await journalWithBuiltIns();
    await journal.checklists.addToStandaloneChecklist('How long before I can lift?');
    const standalone = await journal.checklists.getStandaloneChecklist();
    expect(standalone?.items.map((item) => item.content)).toEqual(['How long before I can lift?']);
  });
});

/* prh12: rows about a procedure open its own screen, not the surgery list. */
describe('rows elsewhere open the procedure screen', () => {
  it('opens a search hit and a day recovery-photo row on /health/surgery/<id>', () => {
    expect(read('src/lib/components/searchHitRows.ts')).toContain(
      "href: (hit) => `${hubRow('surgery').href}/${encodeURIComponent(hit.id)}`"
    );
    expect(read('src/lib/components/dayRows.ts')).toContain(
      'href: `${hubRow(\'surgery\').href}/${encodeURIComponent(group[0].procedureId)}`'
    );
  });
});
