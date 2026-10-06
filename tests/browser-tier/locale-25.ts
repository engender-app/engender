import { setLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';
import { fmtNumber } from '$lib/data/dates';
import { nativeValue } from '$lib/data/wrappedDisplay';
import { makeReviewRows } from '$lib/data/labs/ocr';
import { pickPhotos } from '$lib/stores/photoPicking';
import { documentPicker } from '$lib/data/photos/picker';
import { publishFixture } from './mount';
import { mountScreen, until } from './mount-screen';
import { fixture, assertions, today, type Result } from './screen-contracts/fixture';
import { freshOrigin } from './fresh-origin';

async function largePng(): Promise<File> {
  const canvas = new OffscreenCanvas(320, 240);
  canvas.getContext('2d')!.fillRect(0, 0, 320, 240);
  const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  const dataLength = 30 * 1024 * 1024 - png.length - 12;
  const chunk = new Uint8Array(dataLength + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, dataLength);
  chunk.set([110, 112, 65, 68], 4);
  const table = Array.from({ length: 256 }, (_, value) => {
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value >>> 0;
  });
  let crc = 0xffffffff;
  for (let i = 4; i < chunk.length - 4; i++) crc = table[(crc ^ chunk[i]) & 255] ^ (crc >>> 8);
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
  return new File([png.slice(0, -12), chunk, png.slice(-12)], 'source-30mib.png', { type: 'image/png' });
}

async function withPickedFile<T>(file: File, pick: () => Promise<T>): Promise<T> {
  const click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    this.files = transfer.files;
    this.dispatchEvent(new Event('change'));
  };
  try {
    return await pick();
  } finally {
    HTMLInputElement.prototype.click = click;
  }
}

publishFixture('locale-25', async () => {
  console.log('locale probe: fresh origin');
  await freshOrigin();
  await setLocale('pl', { reload: false });
  console.log('locale probe: fixture');
  const source = await fixture('locale-25', 6);
  source.preferences = { ...source.preferences, language: 'pl', name: 'Alicja' };
  const results: Result[] = [];
  const check = assertions(results);
  await check('Polish mood and fractional doses use decimal commas', () => nativeValue('mood', 3.5) === '3,5' && `${fmtNumber(0.5)} mg` === '0,5 mg');
  await check('Polish OCR uses the selected language', () => makeReviewRows([{ analyte: 'estradiol', value: 123.4, unit: 'pg/mL', date: '', note: '', line: '', lowConfidence: false, unresolvedAnalyte: false }], new Set(), fmtNumber)[0].value === '123,4');
  await check('Polish period and reading joins have translated grammar', () => {
    const range = m.compare_period_range({ from: '1 wrz', to: '30 wrz 2026' });
    return range === '1 wrz do 30 wrz 2026' && !range.includes(' to ') && m.reading_highest_value({ value: '3,5', metric: 'Nastrój' }) === 'Nastrój: 3,5';
  });
  console.log('locale probe: calendar');
  const calendar = await mountScreen('/calendar', source);
  await until(() => calendar.target.querySelector('.cal-dow'), 'calendar weekdays');
  await check('Journal month grid renders Polish weekday letters', () => [...calendar.target.querySelectorAll('.cal-dow')].slice(0, 7).map((el) => el.textContent).join('') === 'PWŚCPSN');
  await check('Polish calendar stays inside 390 px', () => calendar.target.scrollWidth <= 390);
  await calendar.remove();
  const episodeId = await source.journal.regimen.upsertEpisode({ drug: 'Fixture patch', ester: null, dose: 0.5, doseUnit: 'mg', route: 'patch', interval: '3 days', startEpochDay: today - 3, endEpochDay: null, endReason: null });
  await source.journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 3 }, dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
  const home = await mountScreen('/', source);
  await until(() => home.target.querySelector('[data-home-hello]'), 'Home hello');
  await check('Home greeting renders Polish name and date', () => home.target.querySelector('[data-home-hello]')!.textContent!.startsWith('Cześć Alicja · '));
  await check('Home patch schedule renders a decimal comma in its dose', async () => {
    const tile = await until(() => home.target.querySelector('[data-patch-schedule-tile]'), 'patch schedule');
    return tile.textContent!.includes('0,5 mg');
  });
  await home.remove();
  console.log('locale probe: photo');
  const file = await largePng();
  await check('real 30 MiB PNG imports through picker and normalization', async () => {
    const photos = await withPickedFile(file, () => pickPhotos());
    if (file.size !== 30 * 1024 * 1024 || photos.length !== 1) return false;
    const entry = await source.journal.entries.upsertEntry({ epochDay: 20000, timestamp: 20000 * 86400000, mood: 3, note: 'Photo import check' });
    await source.journal.photos.attach({ entryId: entry }, photos[0]);
    const stored = await source.journal.photos.inJournal();
    const decoded = await createImageBitmap(new Blob([photos[0].full as BlobPart]));
    const passed = stored.length === 1 && decoded.width === 320 && decoded.height === 240 && photos[0].full.length < file.size;
    decoded.close();
    return passed;
  });
  await check('same 30 MiB source remains above document ceiling', async () => {
    try { await withPickedFile(file, () => documentPicker().pick()); return false; }
    catch (error) { return (error as { kind?: string }).kind === 'too-large'; }
  });
  let shown = await mountScreen('/settings', source);
  (window as unknown as { __locale25Render: (route: string) => Promise<void> }).__locale25Render = async (route) => {
    await shown.remove();
    shown = await mountScreen(route, source);
    await document.fonts.ready;
  };
  return results;
});
