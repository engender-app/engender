/* After-release 19: the home-screen widgets' buttons are 48 x 48 dp touch
   targets at their default size, and the drawing is the one they had at
   40 dp. No launcher here, so this reads the layout XML and works out the
   geometry the way a vertical LinearLayout lays it out: root padding, the
   header's margins, the button row split by weight, and the background
   inset that keeps the visible pill where it was.

   Widths are taken at the default portrait size Android documents for the
   widget's targetCellWidth, (73n - 16) dp: 57 for one cell, 130 for two,
   276 for four. A launcher with a denser grid gives less. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const res = new URL('../android/app/src/main/res/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, res), 'utf8');

type Attrs = Record<string, string>;

function attrsOf(tag: string): Attrs {
  const out: Attrs = {};
  for (const m of tag.matchAll(/android:(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  const style = /\bstyle="@style\/(\w+)"/.exec(tag);
  if (style) out.style = style[1];
  return out;
}

function dp(value: string | undefined): number {
  if (value === undefined) return 0;
  const m = /^(-?[\d.]+)dp$/.exec(value);
  if (!m) throw new Error(`expected a dp value, got ${value}`);
  return Number(m[1]);
}

const styles = read('values/styles.xml');

function styleAttrs(name: string): Attrs {
  const block = new RegExp(`<style name="${name}"[^>]*>([\\s\\S]*?)</style>`).exec(styles);
  if (!block) throw new Error(`style ${name} not found`);
  const out: Attrs = {};
  for (const m of block[1].matchAll(/<item name="android:(\w+)">([^<]*)<\/item>/g)) out[m[1]] = m[2];
  return out;
}

/** A view's attributes with its style underneath, as inflation resolves them. */
function resolved(tag: string): Attrs {
  const own = attrsOf(tag);
  return { ...(own.style ? styleAttrs(own.style) : {}), ...own };
}

function margin(a: Attrs, side: 'Start' | 'End' | 'Top' | 'Bottom'): number {
  const axis = side === 'Start' || side === 'End' ? a.layout_marginHorizontal : a.layout_marginVertical;
  return dp(a[`layout_margin${side}`] ?? axis ?? a.layout_margin);
}

function padding(a: Attrs, side: 'Start' | 'End' | 'Top' | 'Bottom'): number {
  const axis = side === 'Start' || side === 'End' ? a.paddingHorizontal : a.paddingVertical;
  return dp(a[`padding${side}`] ?? axis ?? a.padding);
}

/** The inset a background drawable leaves around its visible shape. */
function backgroundInset(background: string) {
  const name = /^@drawable\/(\w+)$/.exec(background)?.[1];
  if (!name) throw new Error(`unexpected background ${background}`);
  const xml = read(`drawable/${name}.xml`);
  const inset = /<inset\b[^>]*>/.exec(xml);
  const a = inset ? attrsOf(inset[0]) : {};
  const side = (s: string, axis: string) => dp(a[`inset${s}`] ?? a[`inset${axis}`] ?? a.inset);
  return {
    left: side('Left', 'Horizontal'),
    right: side('Right', 'Horizontal'),
    top: side('Top', 'Vertical'),
    bottom: side('Bottom', 'Vertical')
  };
}

const WIDGETS = [
  { layout: 'widget_quick_log', info: 'quick_log_widget_info', buttons: 5 },
  { layout: 'widget_tally', info: 'tally_widget_info', buttons: 2 },
  { layout: 'widget_doubt', info: 'doubt_widget_info', buttons: 1 }
];

/* The drawing before this ticket, measured from the 40 dp layout: every
   pill 12 dp in from the widget's sides, 6 dp apart, 40 dp tall, 8 dp under
   the header, 12 dp above the widget's bottom edge, and 12 dp under its top
   edge when disguise hides the header. */
const BEFORE = { side: 12, gap: 6, height: 40, underHeader: 8, bottom: 12, topWithoutHeader: 12 };

describe.each(WIDGETS)('$layout buttons', ({ layout, info, buttons: count }) => {
  const xml = read(`layout/${layout}.xml`);
  const root = attrsOf(/<LinearLayout\b[^>]*>/.exec(xml)![0]);
  const header = attrsOf(/<TextView\b[^>]*android:id="@\+id\/widget\w*header"[^>]*\/>/.exec(xml)![0]);
  const buttons = [...xml.matchAll(/<TextView\b[^>]*style="@style\/\w+"[^>]*\/>/g)].map((m) => resolved(m[0]));
  const cells = Number(attrsOf(/<appwidget-provider\b[^>]*>/.exec(read(`xml/${info}.xml`))![0]).targetCellWidth);
  const widgetWidth = 73 * cells - 16;

  const rowWidth = widgetWidth - padding(root, 'Start') - padding(root, 'End');
  const margins = buttons.reduce((sum, b) => sum + margin(b, 'Start') + margin(b, 'End'), 0);
  const slot = (rowWidth - margins) / count;

  it('finds every button', () => {
    expect(buttons).toHaveLength(count);
  });

  it('gives every button a 48 dp tall touch target', () => {
    for (const b of buttons) expect(dp(b.layout_height)).toBeGreaterThanOrEqual(48);
  });

  it(`gives every button a 48 dp wide touch target at the default ${cells}-cell width`, () => {
    for (const b of buttons) expect(dp(b.layout_width) + slot * Number(b.layout_weight ?? 0)).toBeGreaterThanOrEqual(48);
  });

  it('draws the pills where the 40 dp layout drew them', () => {
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const firstInset = backgroundInset(first.background);
    const lastInset = backgroundInset(last.background);
    expect(padding(root, 'Start') + margin(first, 'Start') + firstInset.left).toBe(BEFORE.side);
    expect(padding(root, 'End') + margin(last, 'End') + lastInset.right).toBe(BEFORE.side);

    for (let i = 0; i + 1 < buttons.length; i++) {
      const a = buttons[i];
      const b = buttons[i + 1];
      const gap = margin(a, 'End') + backgroundInset(a.background).right + margin(b, 'Start') + backgroundInset(b.background).left;
      expect(gap).toBe(BEFORE.gap);
    }

    for (const b of buttons) {
      const inset = backgroundInset(b.background);
      expect(dp(b.layout_height) - inset.top - inset.bottom).toBe(BEFORE.height);
      expect(margin(header, 'Bottom') + margin(b, 'Top') + inset.top).toBe(BEFORE.underHeader);
      expect(margin(b, 'Bottom') + inset.bottom + padding(root, 'Bottom')).toBe(BEFORE.bottom);
      expect(padding(root, 'Top') + margin(b, 'Top') + inset.top).toBe(BEFORE.topWithoutHeader);
    }
  });

  it('keeps the header at its old place beside and above', () => {
    expect(padding(root, 'Top') + margin(header, 'Top')).toBe(BEFORE.side);
    expect(padding(root, 'Start') + margin(header, 'Start')).toBe(BEFORE.side);
  });

  it('leaves accessible names to the provider, so disguise can withhold them', () => {
    expect(xml).not.toMatch(/contentDescription/);
  });
});
