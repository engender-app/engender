import { describe, expect, test } from 'vitest';
import { createOcrMachine, type OcrImageSource, type OcrMachineState, type OcrRecognizer, type OcrSaver } from './ocr-machine';
import { epochDayFromDateInputValue } from '../epochDay';
import type { OcrReviewRow } from './ocr';

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

  test('retry from save-failed returns to picking with no stale rows', async () => {
    const m = createOcrMachine(
      imageSourceThat(new Uint8Array([1])),
      recognizerThat(GOOD_OCR_TEXT),
      saverThatThrows()
    );
    m.open();
    await m.pickSource('gallery');
    if (m.state.tag !== 'review') throw new Error(`expected review, got ${m.state.tag}`);
    await m.save();
    m.retry();
    expect(m.state.tag).toBe('picking');
  });
});
