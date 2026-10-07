import { describe, expect, test, vi } from 'vitest';
import { createOcrMachine, type OcrImageSource, type OcrMachineState, type OcrRecognizer, type OcrSaver } from './ocr-machine';
import { epochDayFromDateInputValue } from '../epochDay';
import type { OcrReviewRow } from './ocr';

vi.mock('./units', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./units')>();
  return { ...actual, PREFERRED_UNIT_ANALYTES: [...actual.PREFERRED_UNIT_ANALYTES, 'progesterone'] };
});

// ---------------------------------------------------------------------------
// Stub adapters
// ---------------------------------------------------------------------------

function imageSourceThat(result: Uint8Array | null | 'permission-denied'): OcrImageSource {
  return {
    async pickImage() {
      if (result === 'permission-denied') throw new Error('Permission denied by user');
      return result;
    }
  };
}

function recognizerThat(result: string | 'permission-denied' | 'error'): OcrRecognizer {
  return {
    async recognize() {
      if (result === 'permission-denied') throw new Error('Camera permission denied');
      if (result === 'error') throw new Error('Tesseract crashed');
      return result;
    }
  };
}

function saverWith(existing: Array<{ epochDay: number; analyte: string; value: number; unit: string }> = []): OcrSaver & { saved: Array<unknown> } {
  const saved: Array<unknown> = [];
  return {
    saved,
    async getExistingResults(_analyte) {
      return existing.filter((r) => r.analyte === _analyte);
    },
    async saveResult(params) {
      saved.push(params);
    }
  };
}

const GOOD_OCR_TEXT = `
Date: 2026-08-12
Estradiol 123,4 pg/mL
`;

const TWO_ROWS_OCR_TEXT = `
Date: 2026-08-12
Estradiol 123,4 pg/mL
Prolactin 18,5 ng/mL
`;

const ESTRADIOL_ROW: OcrReviewRow = {
  include: true,
  analyte: 'estradiol',
  value: '123,4',
  unit: 'pg/mL',
  date: '2026-08-12',
  note: '',
  lowConfidence: false,
  duplicate: false
};

// ---------------------------------------------------------------------------
// Success path: pick → recognize → review → save → saved
// ---------------------------------------------------------------------------

describe('OcrMachine – success path', () => {
  test('starts idle', () => {
    const m = createOcrMachine(imageSourceThat(null), recognizerThat(''), saverWith());
    expect(m.state.tag).toBe('idle');
  });

  test('open() moves to picking', () => {
    const m = createOcrMachine(imageSourceThat(null), recognizerThat(''), saverWith());
    m.open();
    expect(m.state.tag).toBe('picking');
  });

  test('onStateChange fires with every transition, not just the object read back from .state', () => {
    const seen: string[] = [];
    const m = createOcrMachine(imageSourceThat(null), recognizerThat(''), saverWith(), (state) =>
      seen.push(state.tag)
    );
    m.open();
    m.close();
    expect(seen).toEqual(['picking', 'idle']);
  });

  test('full success path ends in saved with correct count', async () => {
    const saver = saverWith();
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saver
    );
    m.open();
    await m.pickSource('gallery');

    expect(m.state.tag).toBe('review');
    if (m.state.tag !== 'review') return;

    await m.save();
    expect(m.state).toMatchObject({ tag: 'saved', count: 1 });
    expect(saver.saved).toHaveLength(1);
  });

  test('review state carries parsed rows', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');

    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    expect(m.state.rows).toHaveLength(1);
    expect(m.state.rows[0].analyte).toBe('estradiol');
  });

  test('passes selected source to image adapter', async () => {
    const calledSources: Array<'gallery' | 'camera'> = [];
    const imageSource: OcrImageSource = {
      async pickImage(source) {
        calledSources.push(source);
        return new Uint8Array([1]);
      }
    };
    const m = createOcrMachine(imageSource, recognizerThat(GOOD_OCR_TEXT), saverWith());

    m.open();
    await m.pickSource('camera');

    expect(calledSources).toEqual(['camera']);
    expect(m.state.tag).toBe('review');
  });

  test('saves only included rows and uses edited field values', async () => {
    const saver = saverWith();
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(TWO_ROWS_OCR_TEXT),
      saver
    );
    m.open();
    await m.pickSource('gallery');

    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    expect(m.state.rows).toHaveLength(2);

    const editedRows = [
      {
        ...m.state.rows[0],
        include: true,
        value: '124,6',
        note: 'after breakfast'
      },
      {
        ...m.state.rows[1],
        include: false
      }
    ];

    m.updateRows(editedRows);
    await m.save();

    expect(m.state).toMatchObject({ tag: 'saved', count: 1 });
    expect(saver.saved).toHaveLength(1);
    expect(saver.saved[0]).toMatchObject({
      analyte: 'estradiol',
      value: 124.6,
      unit: 'pg/mL',
      note: 'after breakfast'
    });
  });
});

// ---------------------------------------------------------------------------
// No-rows path
// ---------------------------------------------------------------------------

describe('OcrMachine – no-rows path', () => {
  test('lands in no-rows when OCR text has no usable rows', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat('Laboratory report\nNo data'),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');
    expect(m.state.tag).toBe('no-rows');
  });

  test('retry from no-rows returns to picking', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat('no values here'),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');
    expect(m.state.tag).toBe('no-rows');
    m.retry();
    expect(m.state.tag).toBe('picking');
  });
});

// ---------------------------------------------------------------------------
// Permission-denied path
// ---------------------------------------------------------------------------

describe('OcrMachine – permission-denied path', () => {
  test('lands in permission-denied when image source throws permission error', async () => {
    const m = createOcrMachine(
      imageSourceThat('permission-denied'),
      recognizerThat(''),
      saverWith()
    );
    m.open();
    await m.pickSource('camera');
    expect(m.state.tag).toBe('permission-denied');
  });

  test('lands in permission-denied when recognizer throws permission error', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat('permission-denied'),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');
    expect(m.state.tag).toBe('permission-denied');
  });

  test('retry from permission-denied returns to picking with no stale rows', async () => {
    const m = createOcrMachine(
      imageSourceThat('permission-denied'),
      recognizerThat(''),
      saverWith()
    );
    m.open();
    await m.pickSource('camera');
    expect(m.state.tag).toBe('permission-denied');
    m.retry();
    expect(m.state.tag).toBe('picking');
  });
});

// ---------------------------------------------------------------------------
// Recognition failure path (distinct from no-rows and save-validation failure)
// ---------------------------------------------------------------------------

describe('OcrMachine – recognition-failed path', () => {
  test('lands in recognition-failed when recognizer throws non-permission error', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat('error'),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');
    expect(m.state.tag).toBe('recognition-failed');
  });

  test('retry from recognition-failed returns to picking with no stale rows', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat('error'),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');
    m.retry();
    expect(m.state.tag).toBe('picking');
  });
});

// ---------------------------------------------------------------------------
// Save-validation failure (distinct from recognition-failed)
// ---------------------------------------------------------------------------

describe('OcrMachine – save-validation-failed path', () => {
  test('lands in save-validation-failed when included row has no analyte', async () => {
    const saver = saverWith();
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saver
    );
    m.open();
    await m.pickSource('gallery');

    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    // Blank out the analyte so validation fails
    m.updateRows([{ ...m.state.rows[0], analyte: '' }]);
    await m.save();
    expect(m.state).toMatchObject({ tag: 'save-validation-failed', error: 'missing-analyte' });
  });

  test('save-validation-failed carries the current rows for re-edit', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');

    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    m.updateRows([{ ...m.state.rows[0], analyte: '' }]);
    await m.save();
    expect(m.state).toMatchObject({ tag: 'save-validation-failed' });
    // The rows are preserved in the failed state for re-edit.
    // Cast needed: TS narrows m.state to 'review' through the earlier guard.
    const failedState = m.state as OcrMachineState;
    if (failedState.tag !== 'save-validation-failed') throw new Error('expected save-validation-failed');
    expect(failedState.rows[0].analyte).toBe('');
  });

  test('fixing rows after save-validation-failed allows save to succeed', async () => {
    const saver = saverWith();
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saver
    );
    m.open();
    await m.pickSource('gallery');

    if (m.state.tag !== 'review') throw new Error('expected review');
    m.updateRows([{ ...m.state.rows[0], analyte: '' }]);
    await m.save();
    // still broken, now fix
    m.updateRows([{ ...ESTRADIOL_ROW }]);
    await m.save();

    expect(m.state.tag).toBe('saved');
  });

  test('returns invalid-value when included row value is not numeric', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');

    if (m.state.tag !== 'review') throw new Error('expected review');
    m.updateRows([{ ...m.state.rows[0], value: 'abc' }]);
    await m.save();

    expect(m.state).toMatchObject({ tag: 'save-validation-failed', error: 'invalid-value' });
  });

  test('returns invalid-date when included row has malformed date', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');

    if (m.state.tag !== 'review') throw new Error('expected review');
    m.updateRows([{ ...m.state.rows[0], date: '2026-99-40' }]);
    await m.save();

    expect(m.state).toMatchObject({ tag: 'save-validation-failed', error: 'invalid-date' });
  });
});

// ---------------------------------------------------------------------------
// Duplicate marking
// ---------------------------------------------------------------------------

describe('OcrMachine – duplicate detection', () => {
  test('marks existing results as duplicates and defaults include to false', async () => {
    const epochDay = epochDayFromDateInputValue('2026-08-12');
    if (epochDay === null) throw new Error('fixture date must be valid');
    const existing = [{ epochDay, analyte: 'estradiol', value: 123.4, unit: 'pg/mL' }];
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverWith(existing)
    );
    m.open();
    await m.pickSource('gallery');

    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    expect(m.state.rows[0].duplicate).toBe(true);
    expect(m.state.rows[0].include).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Close / cancel
// ---------------------------------------------------------------------------

describe('OcrMachine – close', () => {
  test('close() from any state returns to idle', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverWith()
    );
    m.open();
    await m.pickSource('gallery');
    expect(m.state.tag).toBe('review');
    m.close();
    expect(m.state.tag).toBe('idle');
  });

  test('close() from picking returns to idle', () => {
    const m = createOcrMachine(imageSourceThat(null), recognizerThat(''), saverWith());
    m.open();
    m.close();
    expect(m.state.tag).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// User cancels picker (image is null)
// ---------------------------------------------------------------------------

describe('OcrMachine – picker cancelled', () => {
  test('cancelling the picker returns to picking, not idle', async () => {
    const m = createOcrMachine(imageSourceThat(null), recognizerThat(''), saverWith());
    m.open();
    await m.pickSource('gallery');
    expect(m.state.tag).toBe('picking');
  });
});

// ---------------------------------------------------------------------------
// Save-failed path (saver.saveResult throws)
// ---------------------------------------------------------------------------

function saverThatThrows(): OcrSaver {
  return {
    async getExistingResults() { return []; },
    async saveResult() { throw new Error('Network error'); }
  };
}

describe('OcrMachine – save-failed path', () => {
  test('lands in save-failed when saveResult throws', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverThatThrows()
    );
    m.open();
    await m.pickSource('gallery');
    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    await m.save();
    expect(m.state).toMatchObject({ tag: 'save-failed' });
  });

  test('save-failed preserves the rows and error text', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverThatThrows()
    );
    m.open();
    await m.pickSource('gallery');
    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    await m.save();
    const s = m.state as OcrMachineState;
    if (s.tag !== 'save-failed') throw new Error('expected save-failed');
    expect(s.rows).toHaveLength(1);
    expect(s.error).toContain('Network error');
  });

  test('retry from save-failed returns to the review with the rows still unsaved', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverThatThrows()
    );
    m.open();
    await m.pickSource('gallery');
    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    const rows = m.state.rows;
    await m.save();
    m.retry();
    expect(m.state).toEqual({ tag: 'review', rows });
  });
});

describe('OcrMachine – preferred-unit default derives from the allowlist', () => {
  test('asks the saver for every allowlisted analyte, including one added after this code was written', async () => {
    const getPreferredUnit = vi.fn(() => null);
    const saver: OcrSaver = { ...saverWith(), getPreferredUnit };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizerThat(GOOD_OCR_TEXT), saver);

    m.open();
    await m.pickSource('gallery');

    expect(getPreferredUnit).toHaveBeenCalledWith('progesterone');
  });
});

/* Phase 9 audit ticket 11. Recognition on a phone photo of a lab report is
   seconds to tens of seconds and said nothing but "Reading…" while it ran.
   Tesseract's own logger reports {status, progress} through the pass
   (ocr-engine.ts), so this state carries the fraction rather than the
   screen keeping a second copy of it beside the machine. */
describe('recognition progress and cancelling', () => {
  test('starts with no fraction and carries whatever the recognizer reports', async () => {
    const seen: (number | null)[] = [];
    const recognizer: OcrRecognizer = {
      async recognize(_image, watch) {
        watch?.onProgress?.(0.4);
        watch?.onProgress?.(0.9);
        return GOOD_OCR_TEXT;
      }
    };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizer, saverWith(), (state) => {
      if (state.tag === 'recognizing') seen.push(state.fraction);
    });

    m.open();
    await m.pickSource('gallery');

    // Null first: the pass is under way before Tesseract has anything to
    // divide by, which is the indeterminate case rather than 0%.
    expect(seen).toEqual([null, 0.4, 0.9]);
  });

  test('cancelling during recognition goes back to the picker', async () => {
    let stopped = false;
    let began: () => void;
    const started = new Promise<void>((resolve) => (began = resolve));
    const recognizer: OcrRecognizer = {
      recognize(_image, watch) {
        return new Promise((_resolve, reject) => {
          watch?.signal?.addEventListener('abort', () => {
            stopped = true;
            reject(new DOMException('stopped', 'AbortError'));
          });
          began();
        });
      }
    };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizer, saverWith());

    m.open();
    const running = m.pickSource('gallery');
    expect(m.state.tag).toBe('recognizing');
    // Waited for on purpose: stopping while the file chooser is still open
    // never reaches the recognizer at all, and this test is about the stop
    // that does.
    await started;
    m.cancel();
    await running;

    /* Not 'recognition-failed': nothing failed, the person stopped it, and
       the picker is where stopping leaves them. Safe to offer at all only
       because this state has written nothing (ADR-0070) - `saving` has,
       and cancel() below leaves it alone. */
    expect(stopped).toBe(true);
    expect(m.state).toEqual({ tag: 'picking' });
  });

  test('cancel does nothing once the rows are being written', async () => {
    const saver = saverWith();
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizerThat(GOOD_OCR_TEXT), saver);

    m.open();
    await m.pickSource('gallery');
    const saving = m.save();
    m.cancel();
    await saving;

    expect(m.state).toMatchObject({ tag: 'saved' });
  });
});

// ---------------------------------------------------------------------------
// Stale writes, failed lookups and partial saves (after-release 05, L02-03)
// ---------------------------------------------------------------------------

/** A promise the test settles by hand, to land a step after close(). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('OcrMachine – a closed sheet stays closed', () => {
  test('closing during recognition keeps it idle when the aborted pass rejects', async () => {
    const recognizer: OcrRecognizer = {
      recognize(_image, watch) {
        return new Promise((_resolve, reject) => {
          watch?.signal?.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')));
        });
      }
    };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizer, saverWith());
    m.open();
    const running = m.pickSource('gallery');
    await Promise.resolve();
    m.close();
    await running;
    expect(m.state).toEqual({ tag: 'idle' });
  });

  test('closing while the picker is open keeps it idle when the image arrives', async () => {
    const image = deferred<Uint8Array | null>();
    const m = createOcrMachine({ pickImage: () => image.promise }, recognizerThat(GOOD_OCR_TEXT), saverWith());
    m.open();
    const running = m.pickSource('gallery');
    m.close();
    image.resolve(new Uint8Array([1]));
    await running;
    expect(m.state).toEqual({ tag: 'idle' });
  });

  test('closing during the duplicate lookup keeps it idle, not in review', async () => {
    const lookup = deferred<[]>();
    const saver: OcrSaver = { getExistingResults: () => lookup.promise, async saveResult() {} };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizerThat(GOOD_OCR_TEXT), saver);
    m.open();
    const running = m.pickSource('gallery');
    await new Promise((r) => setTimeout(r, 0));
    m.close();
    lookup.resolve([]);
    await running;
    expect(m.state).toEqual({ tag: 'idle' });
  });

  test('a pass from before a close and reopen cannot overwrite the new picker', async () => {
    const text = deferred<string>();
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), { recognize: () => text.promise }, saverWith());
    m.open();
    const running = m.pickSource('gallery');
    await new Promise((r) => setTimeout(r, 0));
    m.close();
    m.open();
    text.resolve(GOOD_OCR_TEXT);
    await running;
    expect(m.state).toEqual({ tag: 'picking' });
  });
});

describe('OcrMachine – a failed lookup', () => {
  test('leaves recognizing for lookup-failed, and retry goes back to the picker', async () => {
    const saver: OcrSaver = {
      async getExistingResults() { throw new Error('database locked'); },
      async saveResult() {}
    };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizerThat(GOOD_OCR_TEXT), saver);
    m.open();
    await m.pickSource('gallery');
    expect(m.state).toEqual({ tag: 'lookup-failed' });
    m.retry();
    expect(m.state).toEqual({ tag: 'picking' });
  });
});

describe('OcrMachine – a partial save', () => {
  function saverFailingAfter(landed: number): OcrSaver & { saved: unknown[] } {
    const saved: unknown[] = [];
    return {
      saved,
      async getExistingResults() { return []; },
      async saveResult(params) {
        if (saved.length >= landed) throw new Error('disk full');
        saved.push(params);
      }
    };
  }

  test('says how many rows landed and keeps only the rows that did not', async () => {
    const saver = saverFailingAfter(1);
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizerThat(TWO_ROWS_OCR_TEXT), saver);
    m.open();
    await m.pickSource('gallery');
    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    const [, second] = m.state.rows;
    await m.save();
    expect(m.state).toMatchObject({ tag: 'save-failed', saved: 1, rows: [second] });
  });

  test('saving again from save-failed writes only the rest', async () => {
    let failNext = true;
    const saved: string[] = [];
    const saver: OcrSaver = {
      async getExistingResults() { return []; },
      async saveResult(params) {
        if (saved.length === 1 && failNext) { failNext = false; throw new Error('disk full'); }
        saved.push(params.analyte);
      }
    };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizerThat(TWO_ROWS_OCR_TEXT), saver);
    m.open();
    await m.pickSource('gallery');
    await m.save();
    expect(m.state.tag).toBe('save-failed');
    await m.save();
    expect(saved).toEqual(['estradiol', 'prolactin']);
    expect(m.state).toEqual({ tag: 'saved', count: 2 });
  });
});

describe('OcrMachine – review findings', () => {
  test('the saved count survives a retry, so the toast counts every row that landed', async () => {
    let failNext = true;
    const saved: string[] = [];
    const saver: OcrSaver = {
      async getExistingResults() { return []; },
      async saveResult(params) {
        if (saved.length === 1 && failNext) { failNext = false; throw new Error('disk full'); }
        saved.push(params.analyte);
      }
    };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizerThat(TWO_ROWS_OCR_TEXT), saver);
    m.open();
    await m.pickSource('gallery');
    await m.save();
    m.retry();
    await m.save();
    expect(m.state).toEqual({ tag: 'saved', count: 2 });
  });

  test('closing mid-save stops writing the rows that are left', async () => {
    const first = deferred<void>();
    const saved: string[] = [];
    const saver: OcrSaver = {
      async getExistingResults() { return []; },
      async saveResult(params) {
        saved.push(params.analyte);
        if (saved.length === 1) await first.promise;
      }
    };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizerThat(TWO_ROWS_OCR_TEXT), saver);
    m.open();
    await m.pickSource('gallery');
    const saving = m.save();
    m.close();
    first.resolve();
    await saving;
    expect(saved).toEqual(['estradiol']);
    expect(m.state).toEqual({ tag: 'idle' });
  });

  test('a late progress report from a closed pass does not reach the next one', async () => {
    let oldReport: ((f: number | null) => void) | undefined;
    let calls = 0;
    const recognizer: OcrRecognizer = {
      recognize(_image, watch) {
        calls += 1;
        if (calls === 1) { oldReport = watch?.onProgress; return new Promise(() => {}); }
        return new Promise(() => {});
      }
    };
    const m = createOcrMachine(imageSourceThat(new Uint8Array([1])), recognizer, saverWith());
    m.open();
    void m.pickSource('gallery');
    await new Promise((r) => setTimeout(r, 0));
    m.close();
    m.open();
    void m.pickSource('gallery');
    await new Promise((r) => setTimeout(r, 0));
    oldReport?.(0.9);
    expect(m.state).toEqual({ tag: 'recognizing', fraction: null });
  });
});
