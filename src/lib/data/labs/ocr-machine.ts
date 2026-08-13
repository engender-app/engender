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
import { normalizeUnit } from '../journal/labs';

// ---------------------------------------------------------------------------
// Adapter interfaces (seams for injection and testing)
// ---------------------------------------------------------------------------

export interface OcrImageSource {
  pickImage(source: 'gallery' | 'camera'): Promise<Uint8Array | null>;
}

export interface OcrRecognizer {
  recognize(image: Uint8Array): Promise<string>;
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
  | { tag: 'recognizing' }
  | { tag: 'permission-denied' }
  | { tag: 'no-rows' }
  | { tag: 'recognition-failed' }
  | { tag: 'review'; rows: OcrReviewRow[] }
  | { tag: 'save-validation-failed'; rows: OcrReviewRow[]; error: string }
  | { tag: 'saving'; rows: OcrReviewRow[] }
  | { tag: 'save-failed'; rows: OcrReviewRow[]; error: string }
  | { tag: 'saved'; count: number };

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export interface OcrMachine {
  /** Current machine state. Plain object – wrap in $state in Svelte if needed. */
  state: OcrMachineState;

  /** User opens the import sheet. */
  open(): void;

  /** User selects an image source. Acquires the image then runs recognition. */
  pickSource(source: 'gallery' | 'camera'): Promise<void>;

  /** User retries from permission-denied, no-rows, or save-failed state. */
  retry(): void;

  /** User edits the review rows in place. */
  updateRows(rows: OcrReviewRow[]): void;

  /** User confirms save. Validates, then writes rows via saver adapter. */
  save(): Promise<void>;

  /** User closes / cancels the sheet. Returns to idle. */
  close(): void;
}

export function createOcrMachine(
  imageSource: OcrImageSource,
  recognizer: OcrRecognizer,
  saver: OcrSaver
): OcrMachine {
  const machine: OcrMachine = {
    state: { tag: 'idle' },

    open() {
      machine.state = { tag: 'picking' };
    },

    async pickSource(source) {
      if (machine.state.tag !== 'picking') return;
      machine.state = { tag: 'recognizing' };

      let image: Uint8Array | null;
      try {
        image = await imageSource.pickImage(source);
      } catch (err) {
        if (isPermissionDenied(err)) {
          machine.state = { tag: 'permission-denied' };
        } else {
          // Unexpected pick failure; go back to picking
          machine.state = { tag: 'picking' };
        }
        return;
      }

      if (!image) {
        // User cancelled the picker
        machine.state = { tag: 'picking' };
        return;
      }

      let text: string;
      try {
        text = await recognizer.recognize(image);
      } catch (err) {
        if (isPermissionDenied(err)) {
          machine.state = { tag: 'permission-denied' };
        } else {
          machine.state = { tag: 'recognition-failed' };
        }
        return;
      }

      const parsed = applyPreferredUnitDefaults(
        parseOcrLabRows(text),
        {
          estradiol: saver.getPreferredUnit?.('estradiol') ?? undefined,
          testosterone: saver.getPreferredUnit?.('testosterone') ?? undefined,
          prolactin: saver.getPreferredUnit?.('prolactin') ?? undefined
        }
      );
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
      for (const analyte of analyteNames) {
        const results = await saver.getExistingResults(analyte);
        existing.push(...results);
      }

      const rows = makeReviewRows(parsed, buildDuplicateKeys(existing));
      machine.state = { tag: 'review', rows };
    },

    retry() {
      const { tag } = machine.state;
      if (
        tag === 'permission-denied' ||
        tag === 'no-rows' ||
        tag === 'recognition-failed' ||
        tag === 'save-failed'
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
      if (s.tag !== 'review' && s.tag !== 'save-validation-failed') return;
      const rows = s.rows;

      const validation = validateRowsForSave(rows);
      if (!validation.ok) {
        const error =
          validation.firstError === 'missing-analyte'
            ? 'missing-analyte'
            : validation.firstError === 'invalid-value'
              ? 'invalid-value'
              : validation.firstError === 'missing-date'
                ? 'missing-date'
                : 'invalid-date';
        machine.state = { tag: 'save-validation-failed', rows, error };
        return;
      }

      machine.state = { tag: 'saving', rows };

      let saved = 0;
      try {
        for (const row of rows) {
          if (!row.include) continue;
          const epochDay = epochDayFromDateInputValue(row.date);
          const value = parseLabNumeric(row.value);
          if (epochDay === null || value === null) continue;
          const analyte = row.analyte.trim().toLowerCase();
          if (!analyte) continue;
          await saver.saveResult({ epochDay, analyte, value, unit: row.unit, note: row.note });
          saved += 1;
        }
      } catch (err) {
        machine.state = { tag: 'save-failed', rows, error: String(err) };
        return;
      }

      machine.state = { tag: 'saved', count: saved };
    },

    close() {
      machine.state = { tag: 'idle' };
    }
  };

  return machine;
}

// ---------------------------------------------------------------------------
// (Production adapter factories live in ocr-adapters.ts to keep this module
// free of platform-specific imports and testable in isolation.)
// ---------------------------------------------------------------------------
