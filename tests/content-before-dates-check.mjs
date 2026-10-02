import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, launchChromium, settlePage } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const gallery = process.argv.includes('--gallery');
const out = '.claude/content-before-dates-shots';
if (gallery) await mkdir(out, { recursive: true });
const server = await createServer({
  cacheDir: '.svelte-kit/content-before-dates-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
await page.clock.setFixedTime('2024-03-14T12:00:00Z');
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const sheet = () => page.locator('[data-sheet]');
const radio = () => sheet().locator('[role="radio"][tabindex="0"]');
const flows = [
  { handle: 'milestone', path: 'transition/milestones', date: 'ms-date', area: 'milestones', operation: 'upsertMilestone',
    add: '[data-add]', row: '[data-milestone]', text: 'Fixture milestone',
    values: { 'ms-name': 'Fixture milestone', 'ms-description': 'A day to remember', 'ms-date': '2024-03-12' },
    change: 'ms-description', controls: () => [page.locator('#ms-name'), page.locator('#ms-description'), page.locator('#ms-date'), sheet().locator('.photo-remove'), sheet().getByRole('switch')],
    labels: { 'ms-name': 'ms_name_label', 'ms-description': 'ms_description_label', 'ms-date': 'ms_date_label' } },
  { handle: 'side-effect', path: 'care/changes', date: 'side-effect-date', area: 'sideEffects', operation: 'upsertSideEffect',
    add: '[data-add]', row: '[data-side-effect]', text: 'Fixture headache',
    values: { 'side-effect-name': 'Fixture headache', 'side-effect-date': '2024-03-12' },
    change: 'side-effect-name', controls: () => [page.locator('#side-effect-name'), radio(), page.locator('#side-effect-date')],
    labels: { 'side-effect-name': 'side_effect_name_label', 'side-effect-date': 'side_effect_date_label' }, group: 'side_effect_severity_label' },
  { handle: 'cycle-event', path: 'health/cycle-events', date: 'cycle-event-date', area: 'cycleEvents', operation: 'upsertCycleEvent',
    add: '[data-add]', row: '[data-cycle-event]',
    values: { 'cycle-event-date': '2024-03-12' },
    change: 'cycle-event-date', controls: () => [radio(), page.locator('#cycle-event-date')],
    labels: { 'cycle-event-date': 'cycle_event_date_label' }, group: 'cycle_event_kind_label' },
  { handle: 'hair-stage', path: 'body/hair-progress', date: 'hair-stage-date', area: 'hairProgress', operation: 'upsertStage',
    add: '[data-add-stage]', row: '[data-hair-stage]', text: 'Fixture description',
    values: { 'hair-other-value': 'Fixture description', 'hair-stage-date': '2024-03-12' },
    change: 'hair-other-value', controls: () => [radio(), page.locator('#hair-other-value, #hair-stage-value'), page.locator('#hair-stage-date')],
    labels: { 'hair-other-value': 'hair_other_label', 'hair-stage-date': 'hair_stage_date_label' }, group: 'hair_scale_label' }
];

async function close() {
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
}
async function openNew(flow) {
  await page.locator(flow.add).click();
  if (flow.handle === 'milestone') await page.locator('[data-own]').click();
  await page.locator(`#${flow.date}`).waitFor();
}
async function order(flow) {
  await page.waitForFunction(() => document.querySelectorAll('[data-sheet]').length === 1);
  const controls = [];
  for (const control of flow.controls()) if (await control.count()) controls.push(control);
  const positions = [];
  for (const control of controls) positions.push(await control.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left };
  }));
  for (let i = 1; i < positions.length; i++) {
    const previous = positions[i - 1], current = positions[i];
    assert.ok(current.top > previous.top || (current.top === previous.top && current.left > previous.left),
      `${flow.handle}: content precedes date in visible order`);
  }
  await controls[0].focus();
  for (const control of controls.slice(1)) {
    await page.keyboard.press('Tab');
    assert.equal(await control.evaluate((el) => document.activeElement === el), true,
      `${flow.handle}: Tab follows visible order`);
  }
}
async function reopen(flow) {
  await settlePage(page, server.resolvedUrls.local[0], flow.path, 'light');
  if (flow.handle === 'milestone') await page.locator('[data-ms-log-toggle]').click();
  await page.locator(`${flow.row.slice(0, -1)}="${flow.id}"]`).click();
}
async function valuesMatch(flow) {
  for (const [id, value] of Object.entries(flow.values)) assert.equal(await page.locator(`#${id}`).inputValue(), value, id);
  if (flow.handle === 'side-effect') assert.equal(await radio().getAttribute('data-segment'), '3');
  if (flow.handle === 'cycle-event') assert.equal(await radio().getAttribute('data-segment'), 'spotting');
  if (flow.handle === 'hair-stage') assert.equal(await radio().getAttribute('data-pick-scale'), 'other');
    if (flow.handle === 'milestone') {
      await sheet().locator('.photo-wrap img').waitFor();
      assert.equal(await sheet().getByRole('switch').getAttribute('aria-checked'), 'true');
  }
}
async function capture(name, zoom, flow) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await sheet().evaluate((el) => el.scrollWidth <= el.clientWidth), true, `${name}: no horizontal overflow`);
  for (const control of await sheet().locator('input, textarea, select, button').all()) {
    const box = await control.evaluate((el) => ({ width: el.offsetWidth, height: el.offsetHeight }));
    const overlay = await control.evaluate((el) => {
      const after = getComputedStyle(el, '::after');
      return after.content !== 'none' && after.position === 'absolute'
        ? { width: parseFloat(after.width) || 0, height: parseFloat(after.height) || 0 }
        : { width: 0, height: 0 };
    });
    assert.ok(Math.max(box.width, overlay.width) >= 48 && Math.max(box.height, overlay.height) >= 48,
      `${name}: 48px touch target ${await control.evaluate((el) => el.outerHTML.slice(0, 180))} ${JSON.stringify({ box, overlay, zoom })}`);
  }
  assert.equal(await page.locator(`#${flow.date}`).evaluate((input) => {
    const style = getComputedStyle(input);
    const context = document.createElement('canvas').getContext('2d');
    context.font = `${style.fontSize} ${style.fontFamily}`;
    return context.measureText(input.value).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) <= input.clientWidth;
  }), true, `${name}: readable date`);
  if (gallery) {
    await sheet().evaluate((el) => { el.scrollTop = 0; });
    await sheet().screenshot({ path: `${out}/${name}.png` });
    if (await sheet().evaluate((el) => el.scrollHeight > el.clientHeight)) {
      await sheet().evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await sheet().screenshot({ path: `${out}/${name}-bottom.png` });
    }
  }
}
async function save(flow) {
  await page.locator(`[data-save-${flow.handle}]`).click();
  if (flow.handle === 'milestone') {
    await page.locator('[data-skip-feeling-offer]').click();
  }
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
}

try {
  for (const flow of flows) {
    await settlePage(page, server.resolvedUrls.local[0], flow.path, 'light');
    if (flow.handle === 'cycle-event') await page.evaluate(async () => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      for (const event of await journal.cycleEvents.getCycleEvents()) await journal.cycleEvents.deleteCycleEvent(event.id);
    });
    await openNew(flow);
    const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
    assert.equal(await page.locator(`#${flow.date}`).inputValue(), today, 'Existing today default');
    if (flow.handle === 'hair-stage') {
      assert.equal(await sheet().getByRole('radio', { checked: true }).count(), 0, 'No guessed hair scale');
      assert.equal(await page.locator('[data-save-hair-stage]').isDisabled(), true);
      await page.locator('[data-pick-scale="norwood_hamilton"]').click();
      assert.equal(await page.locator('#hair-stage-value').inputValue(), '1');
      await page.locator('#hair-stage-value').selectOption('3v');
      await page.locator('[data-pick-scale="sinclair"]').click();
      assert.equal(await page.locator('#hair-stage-value').inputValue(), '1', 'Switching scale resets grade');
      await page.locator('[data-pick-scale="other"]').click();
    }
    await order(flow);
    for (const [id, value] of Object.entries(flow.values)) {
      if (id === flow.date) await fillDate(page, `#${id}`, value);
      else await page.locator(`#${id}`).fill(value);
    }
    if (flow.handle === 'side-effect') await sheet().locator('[data-segment="3"]').click();
    if (flow.handle === 'cycle-event') await sheet().locator('[data-segment="spotting"]').click();
    if (flow.handle === 'milestone') {
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        canvas.getContext('2d').fillRect(0, 0, 32, 32);
        return canvas.toDataURL('image/png').split(',')[1];
      });
      const chooser = page.waitForEvent('filechooser');
      await page.locator('[data-add-photo]').click();
      await (await chooser).setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.locator('[data-photo-day-skip]').click();
      await page.locator('[data-photo-day-skip]').waitFor({ state: 'detached' });
      await sheet().locator('.photo-wrap img').waitFor();
      await page.locator('[data-close-record]').click();
      await page.locator('[data-keep-editing]').click();
      await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
      await sheet().locator('.photo-wrap img').waitFor();
    }
    await save(flow);
    if (flow.handle === 'milestone') {
      await page.locator('[data-ms-log-toggle]').click();
    }
    if (flow.handle === 'cycle-event') {
      flow.id = await page.evaluate(async () => {
        const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
        return (await journal.cycleEvents.getCycleEvents()).find((event) => event.epochDay === 19794 && event.kind === 'spotting').id;
      });
      await reopen(flow);
    } else {
      const row = page.locator(flow.row).filter({ hasText: flow.text });
      await row.click();
      flow.id = await row.getAttribute(flow.row.slice(1, -1));
    }
    if (flow.handle === 'milestone') await sheet().getByRole('switch').click();
    if (flow.handle === 'milestone') flow.photo = await page.evaluate(async (id) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      return (await journal.milestones.getMilestones()).find((milestone) => milestone.id === id).photo;
    }, flow.id);
    await valuesMatch(flow);
    await order(flow);
    if (flow.change === flow.date) await fillDate(page, `#${flow.date}`, '2024-03-13');
    else await page.locator(`#${flow.change}`).fill('Unsaved change');
    await page.locator('[data-close-record]').click();
    await page.locator('[data-discard-record]').click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    await reopen(flow);
    await valuesMatch(flow);
    const editedValue = flow.change === flow.date ? '2024-03-13' : flow.values[flow.change] + ' updated';
    if (flow.change === flow.date) await fillDate(page, `#${flow.date}`, editedValue);
    else await page.locator(`#${flow.change}`).fill(editedValue);
    flow.values[flow.change] = editedValue;

    await page.evaluate(async ({ area, operation }) => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
      const target = bootState.journal[area];
      const original = target[operation].bind(target);
      window.contentFault = { mode: 'reject', calls: 0 };
      target[operation] = async (...args) => {
        window.contentFault.calls++;
        if (window.contentFault.mode === 'reject') throw new Error('Fixture write rejection');
        await new Promise((resolve) => { window.contentFault.resolve = resolve; });
        return original(...args);
      };
      attachJournal(bootState.journal); journalIsOpen();
      window.contentFault.restore = () => {
        target[operation] = original;
        attachJournal(bootState.journal); journalIsOpen();
      };
    }, { area: flow.area, operation: flow.operation });
    await page.locator(`[data-save-${flow.handle}]`).click();
    await sheet().getByRole('alert').waitFor();
    await valuesMatch(flow);
    await page.evaluate(() => { window.contentFault.mode = 'pending'; });
    await page.locator(`[data-save-${flow.handle}]`).click();
    await page.waitForFunction(() => window.contentFault.resolve);
    assert.equal(await page.locator(`[data-save-${flow.handle}]`).isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await sheet().count(), 1, 'Pending save blocks dismissal');
    await page.evaluate(() => window.contentFault.resolve());
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    assert.equal(await page.evaluate(() => window.contentFault.calls), 2, 'One rejected write and one retry');
    await page.evaluate(() => window.contentFault.restore());
    await reopen(flow);
    await valuesMatch(flow);
    if (flow.handle === 'milestone') assert.deepEqual(await page.evaluate(async (id) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      return (await journal.milestones.getMilestones()).find((milestone) => milestone.id === id).photo;
    }, flow.id), flow.photo, 'Editing preserves existing photo identity, date and file');
    await close();
    console.log(`PASS ${flow.handle}: content and Tab order, defaults, create/reopen/edit, discard, rejected save and pending retry`);
  }

  const side = flows[1];
  await settlePage(page, server.resolvedUrls.local[0], side.path, 'light');
  await page.locator(`[data-side-effect=\"${side.id}\"]`).click();
  await page.locator('[data-add-to-appointment-prep]').click();
  await close();
  await settlePage(page, server.resolvedUrls.local[0], 'health/appointment-prep', 'light');
  await page.getByText('Fixture headache', { exact: false }).waitFor();
  console.log('PASS side effect remains owned by Changes; appointment preparation receives its name');

  for (const choice of [false, true]) {
    await page.evaluate(async (choice) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.cycleTrackingChoice = choice;
    }, choice);
    await settlePage(page, server.resolvedUrls.local[0], 'care/changes', 'light');
    assert.equal(await page.locator('a[href="/health/cycle-events"]').count(), choice ? 1 : 0);
    await reopen(flows[2]);
    await valuesMatch(flows[2]);
    await close();
  }
  console.log('PASS cycle choice gates offers; existing event stays directly editable with tracking off');

  for (const locale of ['en', 'pl']) {
    const copy = JSON.parse(await readFile(`messages/${locale}.json`, 'utf8'));
    await page.evaluate(async (locale) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.language = locale; setLocale(locale, { reload: false });
    }, locale);
    for (const flow of flows) {
      await reopen(flow);
      for (const [id, key] of Object.entries(flow.labels)) {
        assert.equal(await page.getByRole('textbox', { name: copy[key], exact: true }).getAttribute('id'), id);
      }
      if (flow.group) assert.equal(await sheet().getByRole('radiogroup', { name: copy[flow.group], exact: true }).count(), 1);
      const saveKey = flow.handle === 'milestone' ? 'ms_save_changes' : flow.handle.replaceAll('-', '_') + '_save';
      assert.equal(await page.locator(`[data-save-${flow.handle}]`).innerText(), copy[saveKey]);
      for (const zoom of [1, 2]) {
        await page.evaluate(async (zoom) => {
          document.documentElement.style.zoom = String(zoom);
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.disguise = zoom === 2;
        }, zoom);
        await order(flow);
        await capture(`${locale}-${flow.handle}-${zoom}x`, zoom, flow);
        if (flow.handle === 'hair-stage') {
          await page.locator('[data-pick-scale="sinclair"]').click();
          await order(flow);
          await capture(`${locale}-${flow.handle}-${zoom}x-graded`, zoom, flow);
          await page.locator('[data-pick-scale="other"]').click();
          assert.equal(await page.locator('#hair-other-value').inputValue(), '', 'Switching scale clears prose');
          await page.locator('#hair-other-value').fill(flow.values['hair-other-value']);
        }
      }
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      if (gallery) for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette; prefs.theme = theme; prefs.disguise = false;
        }, { palette, theme });
        await capture(`${locale}-${flow.handle}-${palette}-${theme}`, 1, flow);
      }
      if (flow.handle === 'milestone') {
        await close();
        await page.getByRole('button', { name: copy.ms_delete_aria.replace('{name}', flow.values['ms-name']), exact: true }).click();
      } else await page.locator(`[data-delete-${flow.handle}]`).click();
      await page.locator(`[data-confirm-delete-${flow.handle}]`).waitFor();
      await sheet().getByRole('button', { name: copy.keep_it, exact: true }).click();
      await page.waitForSelector('[data-sheet]', { state: 'detached' });
    }
    console.log(`PASS ${locale}: equivalent labels/actions, reading/Tab order, 48px targets at 390px and 200% zoom`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
