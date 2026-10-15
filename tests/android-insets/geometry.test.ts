import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInside, physicalBounds, safeScreenBounds, webViewBounds } from './geometry.mjs';

describe('Android inset proof geometry', () => {
  const captured = readFileSync(new URL('./api35-insets.txt', import.meta.url), 'utf8');

  it('derives system-bar and cutout clearance from a captured API35 dump', () => {
    expect(safeScreenBounds(captured, 1080, 2400, false).safe)
      .toEqual({ left: 0, top: 128, right: 1080, bottom: 2337 });
    expect(() => safeScreenBounds(captured, 2400, 1080, false)).toThrow('dimensions agree');
    expect(() => safeScreenBounds('', 1080, 2400, false)).toThrow('state must be present');
  });

  it('reads the API33 native source names without weakening source counts', () => {
    const legacy = readFileSync(new URL('./api33-insets.txt', import.meta.url), 'utf8');
    expect(safeScreenBounds(legacy, 1080, 2400, false).safe)
      .toEqual({ left: 0, top: 128, right: 1080, bottom: 2337 });
    expect(() => safeScreenBounds(legacy.replace('type=ITYPE_STATUS_BAR', 'type=unknown'), 1080, 2400, false))
      .toThrow('native statusBars source');
  });

  it('requires IME geometry instead of treating an unshown keyboard as proof', () => {
    expect(() => safeScreenBounds(captured, 1080, 2400, true)).toThrow('IME inset visibility');
    const keyboard = captured.replace('type=ime frame=[0,0][0,0] visible=false',
      'type=ime frame=[0,1500][1080,2400] visible=true');
    expect(safeScreenBounds(keyboard, 1080, 2400, true).safe.bottom).toBe(1500);
    expect(() => safeScreenBounds(keyboard.replace('type=ime', 'type=unknown'), 1080, 2400, true))
      .toThrow('native ime source');
  });

  it('reads the visible IME frame emitted by API33', () => {
    const keyboard = readFileSync(new URL('./api33-ime-insets.txt', import.meta.url), 'utf8');
    expect(safeScreenBounds(keyboard, 1080, 2400, true).safe)
      .toEqual({ left: 0, top: 128, right: 1080, bottom: 1517 });
  });

  it('accepts an IME spanning the cutout-safe width but rejects a narrower source', () => {
    const keyboard = readFileSync(new URL('./api33-landscape-ime-insets.txt', import.meta.url), 'utf8');
    expect(safeScreenBounds(keyboard, 2400, 1080, true).safe)
      .toEqual({ left: 126, top: 63, right: 2400, bottom: 394 });
    expect(() => safeScreenBounds(keyboard.replace('frame=[126,394]', 'frame=[127,394]'), 2400, 1080, true))
      .toThrow('Unsupported partial ime inset');
  });

  it('applies side navigation before an IME that appears earlier in the native dump', () => {
    const keyboard = readFileSync(new URL('./api35-landscape-ime-insets.txt', import.meta.url), 'utf8');
    expect(safeScreenBounds(keyboard, 2400, 1080, true).safe)
      .toEqual({ left: 126, top: 63, right: 2274, bottom: 520 });
    expect(() => safeScreenBounds(keyboard.replace('frame=[126,520][2274,1080]', 'frame=[126,520][2273,1080]'), 2400, 1080, true))
      .toThrow('Unsupported partial ime inset');
  });

  it('reads only the isolated application WebView', () => {
    const hierarchy = '<node class="android.webkit.WebView" package="other" bounds="[0,0][900,900]" />'
      + '<node class="android.webkit.WebView" package="proof" bounds="[30,90][1110,2100]" />';
    expect(webViewBounds(hierarchy, 'proof')).toEqual({ left: 30, top: 90, right: 1110, bottom: 2100 });
    expect(() => webViewBounds(hierarchy, 'missing')).toThrow('native screen bounds');
  });

  it('maps CSS positions through the actual offset and density', () => {
    expect(physicalBounds({ left: 10, top: 20, right: 110, bottom: 70 },
      { left: 30, top: 90, right: 1110, bottom: 2100 }, 360))
      .toEqual({ left: 60, top: 150, right: 360, bottom: 300 });
  });

  it('rejects clipped controls and empty controls', () => {
    const safe = { left: 30, top: 90, right: 1110, bottom: 1400 };
    expect(() => assertInside({ left: 30, top: 90, right: 500, bottom: 1400 }, safe, 'Save')).not.toThrow();
    expect(() => assertInside({ left: 30, top: 90, right: 500, bottom: 1405 }, safe, 'Save')).toThrow('safe bounds');
    expect(() => assertInside({ left: 30, top: 87, right: 500, bottom: 1400 }, safe, 'Header')).toThrow('safe bounds');
    expect(() => assertInside({ left: 30, top: 90, right: 30, bottom: 1400 }, safe, 'Save')).toThrow('positive area');
  });
});
