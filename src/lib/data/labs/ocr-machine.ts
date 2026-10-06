import {
  applyPreferredUnitDefaults,
  buildDuplicateKeys,
  isPermissionDenied,
  makeReviewRows,
  parseLabNumeric,
  parseOcrLabRows,
  validateRowsForSave,
  type OcrReviewRow
} from './ocr';
import { epochDayFromDateInputValue } from '../epochDay';
import { PREFERRED_UNIT_ANALYTES } from './units';

// ---------------------------------------------------------------------------
// Adapter interfaces (seams for injection and testing)
// ---------------------------------------------------------------------------

export interface OcrImageSource {
  pickImage(source: 'gallery' | 'camera'): Promise<Uint8Array | null>;
}

/** Watching a recognition pass that is already running (phase 9 audit
    ticket 11, ADR-0070). */
export interface OcrWatch {
  /** How far through the pass Tesseract says it is, or null while it is
      still loading its language data and has nothing to divide by. */
  onProgress?(fraction: number | null): void;
  /** Stops the pass. Safe here and only here: recognition reads a picked
      file and never touches the journal, so stopping means picking again
      (ADR-0070). */
  signal?: AbortSignal;
}

export interface OcrRecognizer {
  recognize(image: Uint8Array, watch?: OcrWatch): Promise<string>;
}

export interface OcrSaver {
  getExistingResults(analyte: string): Promise<
    Array<{ epochDay: number; analyte: string; value: number; unit: string }>
  >;
  saveResult(params: {
    epochDay: number;
    analyte: string;
    value: number;
    unit: string;
    note: string;
  }): Promise<void>;
  getPreferredUnit?(analyte: string): string | null;
}

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type OcrMachineState =
  | { tag: 'idle' }
  | { tag: 'picking' }
  /** Picking the image and reading it. `fraction` is null until Tesseract
      has loaded enough to say how far through the pass it is. */
  | { tag: 'recognizing'; fraction: number | null }
  | { tag: 'permission-denied' }
  | { tag: 'no-rows' }
  | { tag: 'recognition-failed' }
  /** The page was read, but checking its rows against the journal for
      duplicates failed, so there is nothing safe to review yet. */
  | { tag: 'lookup-failed' }
  | { tag: 'review'; rows: OcrReviewRow[] }
  | { tag: 'save-validation-failed'; rows: OcrReviewRow[]; error: string }
  | { tag: 'saving'; rows: OcrReviewRow[] }
  /** `rows` holds only what did not land; `saved` counts what did, across
      every attempt, so the sheet can say so and a second save writes the
      rest without doubling the first. */
  | { tag: 'save-failed'; rows: OcrReviewRow[]; error: string; saved: number }
  | { tag: 'saved'; count: number };

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

interface OcrMachine {
  /** Current machine state. Wrapping this object in $state does not make
      reads of `.state` reactive - every write here happens on the object
      this factory closed over, not on a caller's proxy. Pass an
      onStateChange callback to createOcrMachine and mirror it into your own
      reactive state instead. */
  state: OcrMachineState;

  /** User opens the import sheet. */
  open(): void;

  /** User selects an image source. Acquires the image then runs recognition. */
  pickSource(source: 'gallery' | 'camera'): Promise<void>;

  /** User retries. From save-failed that is the review of the rows still
      unsaved; from every other failure it is the picker. */
  retry(): void;

  /** User edits the review rows in place. */
  updateRows(rows: OcrReviewRow[]): void;

  /** User confirms save. Validates, then writes rows via saver adapter. */
  save(): Promise<void>;

  /** User stops the pass. Only `recognizing` answers to it: that state has
      written nothing, so stopping means picking again, while `saving` is
      already putting rows in the journal and has no defined rollback -
      the same rule that makes archive import uncancellable (ADR-0070). */
  cancel(): void;

  /** User closes / cancels the sheet. Returns to idle. */
  close(): void;
}

export function createOcrMachine(
  imageSource: OcrImageSource,
  recognizer: OcrRecognizer,
  saver: OcrSaver,
  onStateChange?: (state: OcrMachineState) => void
): OcrMachine {
  let currentState: OcrMachineState = { tag: 'idle' };
  /** Live only while a pass is running, so the stop button and the
      recognizer are talking about the same one. */
  let attempt: AbortController | null = null;
  /** The sheet session every async step belongs to. open() and close()
      replace it, so a step that resolves after the sheet closed (or closed
      and opened again) finds a different token and writes nothing. */
  let session = {};
  const stale = (mine: object) => mine !== session;

  const machine: OcrMachine = {
    get state() {
      return currentState;
    },
    set state(next) {
      currentState = next;
      onStateChange?.(next);
    },

    open() {
      session = {};
      machine.state = { tag: 'picking' };
    },

    async pickSource(source) {
      if (machine.state.tag !== 'picking') return;
      const mine = session;
      machine.state = { tag: 'recognizing', fraction: null };
      const running = new AbortController();
      attempt = running;

      let image: Uint8Array | null;
      try {
        image = await imageSource.pickImage(source);
      } catch (err) {
        if (stale(mine)) return;
        attempt = null;
        if (isPermissionDenied(err)) {
          machine.state = { tag: 'permission-denied' };
        } else {
          // Unexpected pick failure; go back to picking
          machine.state = { tag: 'picking' };
        }
        return;
      }

      if (stale(mine)) return;
      if (!image || running.signal.aborted) {
        // User cancelled the picker, or stopped the pass while it was open
        attempt = null;
        machine.state = { tag: 'picking' };
        return;
      }

      let text: string;
      try {
        text = await recognizer.recognize(image, {
          signal: running.signal,
          onProgress: (fraction) => {
            // Late reports from a pass the person already stopped must not
            // put the sheet back into recognizing.
            if (machine.state.tag === 'recognizing') machine.state = { tag: 'recognizing', fraction };
          }
        });
      } catch (err) {
        if (stale(mine)) return;
        attempt = null;
        // Stopping is an answer, not a failure: the picker is where it
        // leaves them, with nothing to apologise for.
        if (running.signal.aborted) {
          machine.state = { tag: 'picking' };
        } else if (isPermissionDenied(err)) {
          machine.state = { tag: 'permission-denied' };
        } else {
          machine.state = { tag: 'recognition-failed' };
        }
        return;
      }
      if (stale(mine)) return;
      attempt = null;

      const preferredUnits = Object.fromEntries(
        PREFERRED_UNIT_ANALYTES.map((analyte) => [analyte, saver.getPreferredUnit?.(analyte) ?? undefined])
      );
      const parsed = applyPreferredUnitDefaults(parseOcrLabRows(text), preferredUnits);
      if (!parsed.length) {
        machine.state = { tag: 'no-rows' };
        return;
      }

      // Look up existing results to mark duplicates.
      const analyteNames = [
        ...new Set(parsed.map((r) => r.analyte.trim().toLowerCase()).filter(Boolean))
      ];
      const existing: Array<{
        epochDay: number;
        analyte: string;
        value: number;
        unit: string;
      }> = [];
      try {
        for (const analyte of analyteNames) {
          const results = await saver.getExistingResults(analyte);
          if (stale(mine)) return;
          existing.push(...results);
        }
      } catch {
        if (stale(mine)) return;
        machine.state = { tag: 'lookup-failed' };
        return;
      }

      const rows = makeReviewRows(parsed, buildDuplicateKeys(existing));
      machine.state = { tag: 'review', rows };
    },

    retry() {
      const s = machine.state;
      const { tag } = s;
      if (s.tag === 'save-failed') {
        machine.state = { tag: 'review', rows: s.rows };
      } else if (
        tag === 'permission-denied' ||
        tag === 'no-rows' ||
        tag === 'recognition-failed' ||
        tag === 'lookup-failed'
      ) {
        machine.state = { tag: 'picking' };
      }
    },

    updateRows(rows) {
      const s = machine.state;
      // No-op during saving: the UI disables inputs while a save is in flight,
      // so we silently ignore any stale events rather than letting them corrupt
      // the row list that is being persisted.
      if (s.tag === 'review' || s.tag === 'save-validation-failed') {
        machine.state = { tag: 'review', rows };
      }
    },

    async save() {
      const s = machine.state;
      if (s.tag !== 'review' && s.tag !== 'save-validation-failed' && s.tag !== 'save-failed') return;
      const rows = s.rows;
      const before = s.tag === 'save-failed' ? s.saved : 0;
      const mine = session;

      const validation = validateRowsForSave(rows);
      if (!validation.ok) {
        machine.state = { tag: 'save-validation-failed', rows, error: validation.firstError ?? 'invalid-date' };
        return;
      }

      machine.state = { tag: 'saving', rows };

      let saved = 0;
      /* Rows are written one at a time with no rollback (ADR-0070), so a
         failure part way leaves some in the journal. Those leave the list. */
      const landed = new Set<OcrReviewRow>();
      try {
        for (const row of rows) {
          if (!row.include) continue;
          const epochDay = epochDayFromDateInputValue(row.date);
          const value = parseLabNumeric(row.value);
          if (epochDay === null || value === null) continue;
          const analyte = row.analyte.trim().toLowerCase();
          if (!analyte) continue;
          await saver.saveResult({ epochDay, analyte, value, unit: row.unit, note: row.note });
          landed.add(row);
          saved += 1;
        }
      } catch (err) {
        if (stale(mine)) return;
        machine.state = {
          tag: 'save-failed',
          rows: rows.filter((row) => !landed.has(row)),
          error: String(err),
          saved: before + saved
        };
        return;
      }

      if (stale(mine)) return;
      machine.state = { tag: 'saved', count: before + saved };
    },

    cancel() {
      if (machine.state.tag !== 'recognizing') return;
      attempt?.abort();
    },

    close() {
      session = {};
      attempt?.abort();
      attempt = null;
      machine.state = { tag: 'idle' };
    }
  };

  return machine;
}

// ---------------------------------------------------------------------------
// (Production adapter factories live in ocr-adapters.ts to keep this module
// free of platform-specific imports and testable in isolation.)
// ---------------------------------------------------------------------------
