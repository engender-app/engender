/* Entry save lifecycle. Reactive state is supplied by entrySession.svelte.ts;
   the same lifecycle runs against in-memory storage in the Node tier. */
import { createEntryDraft, type EntryDraft } from '../data/entryDraft';
import { applyPersistedDraft, draftMatchesRoute, entryDraftFingerprint, serializeDraft } from '../data/entryDraftPersistence';
import type { EntryDraftStore } from '../data/entryDraftStore';
import type { EntriesArea, EntryInput } from '../data/journal/entries';
import type { Entry } from '../data/types';
import type { LeaveGuardOptions } from './kit/leaveGuard';

export type EntrySessionState = {
  draft: EntryDraft;
  saving: boolean;
  pendingOperations: number;
  mirrorRead: boolean;
  baseline: string | null;
  starred: boolean;
  destination: string;
  navigationFailed: boolean;
};

export type EntrySessionOptions = {
  entryId?: number;
  epochDay: number;
  seedMood?: number | null;
  entries: Pick<EntriesArea, 'upsertEntry'>;
  draftStore: EntryDraftStore;
  navigate(destination: string): Promise<void>;
  preparing?: () => boolean;
  creation?: () => Pick<EntryInput, 'debriefForAppointment'>;
  destination?: (moodOnly: boolean) => (id: number) => string;
};

type EntrySaveRecovery = {
  entryId: number | undefined;
  epochDay: number;
  draft: EntryDraft;
  starred: boolean;
  destination: string;
  settled: Promise<void>;
};

// A privacy gate unmounts the editor while its storage operation continues.
let detachedEntrySave: EntrySaveRecovery | undefined;

export function initialEntrySession(options: EntrySessionOptions): EntrySessionState {
  return {
    draft: createEntryDraft(options.epochDay, undefined, options.seedMood),
    saving: false, pendingOperations: 0, mirrorRead: false, baseline: null,
    starred: false, destination: '/', navigationFailed: false
  };
}

export function entrySessionCore(options: EntrySessionOptions, state = initialEntrySession(options)) {
  const { entryId, draftStore } = options;
  let destroyed = false;
  let saveRecovery: EntrySaveRecovery | undefined;
  let initialized = false;

  const preparing = () => !state.mirrorRead || state.pendingOperations > 0 || !!options.preparing?.();
  const guardOptions: LeaveGuardOptions = {
    holding: () => state.baseline !== null && state.draft.savedId === undefined &&
      entryDraftFingerprint(state.draft) !== state.baseline,
    busy: () => state.saving
  };

  async function prepare(operation: () => Promise<void>) {
    if (state.saving || state.draft.savedId !== undefined) return;
    state.pendingOperations++;
    try { await operation(); }
    finally { state.pendingOperations--; }
  }

  async function restore(target: EntryDraft): Promise<EntryDraft> {
    const recovery = detachedEntrySave;
    if (recovery && recovery.entryId === entryId &&
        (entryId != null || recovery.epochDay === target.epochDay)) {
      state.baseline ??= entryDraftFingerprint(target);
      state.draft = recovery.draft;
      state.saving = true;
      try { await recovery.settled; }
      finally { state.saving = false; }
      if (!destroyed && recovery.draft.savedId !== undefined) draftStore.clear();
      state.starred = recovery.starred;
      state.destination = recovery.destination;
      if (!destroyed && detachedEntrySave === recovery) detachedEntrySave = undefined;
      return recovery.draft;
    }
    const persisted = await draftStore.read();
    if (persisted) {
      if (draftMatchesRoute(persisted, entryId, target.epochDay)) {
        state.baseline ??= entryDraftFingerprint(target);
        applyPersistedDraft(target, persisted);
      } else draftStore.clear();
    }
    return target;
  }

  // Existing entries only initialize after a successful query result.
  async function resume(entry?: Entry) {
    if (initialized || destroyed || (entryId != null && !entry)) return;
    initialized = true;
    await prepare(async () => {
      const fresh = entry ? createEntryDraft(entry.epochDay, entry) : state.draft;
      if (entry) {
        state.baseline = entryDraftFingerprint(fresh);
        state.starred = entry.starred;
      }
      try {
        state.draft = await restore(fresh);
      } finally { state.mirrorRead = true; }
    });
  }

  function establishBaseline() {
    if (state.baseline === null && !preparing()) state.baseline = entryDraftFingerprint(state.draft);
  }

  function mirror() {
    if (state.draft.savedId !== undefined) return;
    const snapshot = serializeDraft(state.draft);
    if (state.mirrorRead) void draftStore.write(snapshot);
  }

  function dispose(locked: boolean) {
    destroyed = true;
    if (saveRecovery) detachedEntrySave = saveRecovery;
    else if (!state.saving && !locked) draftStore.clear();
  }

  async function leave() { await options.navigate(state.destination); }

  async function leaveSaved() {
    try {
      await leave();
      return true;
    } catch (error) {
      console.error('could not navigate after saving the entry', error);
      state.navigationFailed = true;
      return false;
    }
  }

  async function save() {
    if (state.saving || preparing()) return;
    if (state.draft.savedId !== undefined) {
      await leaveSaved();
      return;
    }
    if (state.draft.mood == null) return;
    state.saving = true;
    let settle!: () => void;
    const recovery: EntrySaveRecovery = {
      entryId, epochDay: state.draft.epochDay, draft: state.draft,
      starred: state.starred, destination: '/',
      settled: new Promise<void>((resolve) => { settle = resolve; })
    };
    saveRecovery = recovery;
    const moodOnly = state.draft.hasMoodOnlyContent;
    const destination = options.destination?.(moodOnly);
    let id: number;
    try {
      id = await state.draft.save(options.entries, { starred: state.starred, ...options.creation?.() });
      draftStore.clear();
      state.destination = destination?.(id) ?? '/';
      recovery.destination = state.destination;
    } finally {
      state.saving = false;
      saveRecovery = undefined;
      settle();
    }
    if (destroyed) return;
    return { id, moodOnly, navigated: await leaveSaved() };
  }

  return {
    state, guardOptions, prepare, resume, establishBaseline, mirror, dispose, save, leave,
    acceptDiscard: () => { state.baseline = entryDraftFingerprint(state.draft); },
    get preparing() { return preparing(); }
  };
}
