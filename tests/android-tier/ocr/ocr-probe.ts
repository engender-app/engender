import { tesseractLabOcrEngine } from '../../../src/lib/data/labs/ocr-engine';
import { parseOcrLabRows } from '../../../src/lib/data/labs/ocr';

const engine = tesseractLabOcrEngine();
const fixtures = [
  { language: 'en', lines: ['Laboratory results', 'Date: 2026-08-12',
    'Estradiol 123.4 pg/mL', 'Testosterone 0.92 ng/mL', 'Prolactin 18.5 ng/mL'],
    values: [123.4, 0.92, 18.5] },
  { language: 'pl', lines: ['Wyniki badań', 'Data: 12.08.2026',
    'Estradiol 141,0 pg/mL', 'Testosteron 0,80 ng/mL', 'Prolaktyna 22,1 ng/mL'],
    values: [141, 0.8, 22.1] }
];
const probe = {
  ready: true,
  result: null as unknown,
  async run() {
    probe.ready = false;
    try {
      const before = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/tesseract/'));
      if (before.length) throw new Error('OCR assets loaded before recognition was requested');
      const scans = [];
      for (const fixture of fixtures) {
        const canvas = document.createElement('canvas');
        canvas.width = 1600; canvas.height = 460;
        const context = canvas.getContext('2d')!;
        context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'black'; context.font = '48px sans-serif';
        fixture.lines.forEach((line, index) => context.fillText(line, 40, 65 + index * 80));
        const image = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
        const progress: number[] = [];
        const recognized = await engine.recognize(new Uint8Array(await image.arrayBuffer()), {
          onProgress: value => { if (value !== null) progress.push(value); }
        });
        const rows = parseOcrLabRows(recognized.data.text);
        for (const [index, analyte] of ['estradiol', 'testosterone', 'prolactin'].entries()) {
          const row = rows.find(row => row.analyte === analyte);
          if (!row || row.value !== fixture.values[index] || row.date !== '2026-08-12' || row.lowConfidence) {
            throw new Error(`${fixture.language} lab extraction differs: ${JSON.stringify(rows)}; OCR: ${recognized.data.text}`);
          }
        }
        if (!progress.some(value => value > 0) || !progress.includes(1)) throw new Error('recognition progress missing');
        scans.push({ language: fixture.language, text: recognized.data.text, rows, progress });
      }
      probe.result = { passed: true, lazy: true, scans };
    } catch (error) { probe.result = { passed: false, error: String(error) }; }
    probe.ready = true;
  }
};
Object.assign(window, { ocrProbe: probe });
