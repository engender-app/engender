import assert from 'node:assert/strict';

/** @typedef {{ left: number, top: number, right: number, bottom: number }} Bounds */

/** @param {string} hierarchy @param {string} packageName */
export function webViewBounds(hierarchy, packageName) {
  const node = hierarchy.match(/<node\b[^>]*class="android\.webkit\.WebView"[^>]*>/g)
    ?.find((item) => item.includes(`package="${packageName}"`));
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(bounds, 'The isolated app WebView must have native screen bounds');
  const [left, top, right, bottom] = bounds.slice(1).map(Number);
  assert.ok(right > left && bottom > top, 'The native WebView must have positive area');
  return { left, top, right, bottom };
}

/** @param {Bounds} rect @param {Bounds} webView @param {number} viewportWidth */
export function physicalBounds(rect, webView, viewportWidth) {
  assert.ok(viewportWidth > 0, 'CSS viewport width must be positive');
  const scale = (webView.right - webView.left) / viewportWidth;
  return {
    left: webView.left + rect.left * scale,
    top: webView.top + rect.top * scale,
    right: webView.left + rect.right * scale,
    bottom: webView.top + rect.bottom * scale
  };
}

/** @param {Bounds} rect @param {Bounds} safe @param {string} label */
export function assertInside(rect, safe, label) {
  assert.ok(rect.right > rect.left && rect.bottom > rect.top, `${label} has positive area`);
  const tolerance = 2;
  assert.ok(rect.left >= safe.left - tolerance && rect.top >= safe.top - tolerance
    && rect.right <= safe.right + tolerance && rect.bottom <= safe.bottom + tolerance,
  `${label} ${JSON.stringify(rect)} exceeds safe bounds ${JSON.stringify(safe)}`);
}


/** @param {string} dump @param {number} width @param {number} height @param {boolean} keyboard */
export function safeScreenBounds(dump, width, height, keyboard) {
  const state = dump.split('WindowInsetsStateController')[1]?.split('Control map:')[0]
    ?.replaceAll('type=ITYPE_STATUS_BAR ', 'type=statusBars ')
    .replaceAll('type=ITYPE_NAVIGATION_BAR ', 'type=navigationBars ')
    .replaceAll('type=ITYPE_IME ', 'type=ime ');
  assert.ok(state, 'The native window inset state must be present');
  const frame = state.match(/mDisplayFrame=Rect\((\d+), (\d+) - (\d+), (\d+)\)/);
  assert.ok(frame, 'The native display frame must be present');
  assert.deepEqual(frame.slice(1).map(Number), [0, 0, width, height], 'Screenshot and native display dimensions agree');
  const cutout = state.match(/mDisplayCutout=DisplayCutout\{insets=Rect\((\d+), (\d+) - (\d+), (\d+)\)/);
  assert.ok(cutout, 'The native cutout insets must be present');
  const [left, top, right, bottom] = cutout.slice(1).map(Number);
  const safe = { left, top, right: width - right, bottom: height - bottom };
  const sources = [...state.matchAll(/InsetsSource[^\n]*?type=(statusBars|navigationBars|ime) frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\](?: visibleFrame=\[\d+,\d+\]\[\d+,\d+\])? visible=(true|false)/g)]
    .map((match) => ({ type: match[1], left: Number(match[2]), top: Number(match[3]),
      right: Number(match[4]), bottom: Number(match[5]), visible: match[6] === 'true' }));
  for (const type of ['statusBars', 'navigationBars', 'ime']) {
    assert.equal(sources.filter((source) => source.type === type).length, 1, `Exactly one native ${type} source must be present`);
  }
  assert.equal(sources.find((source) => source.type === 'ime')?.visible, keyboard, 'Native IME inset visibility agrees');
  for (const source of sources.filter((source) => source.visible)) {
    assert.ok(source.right > source.left && source.bottom > source.top, `${source.type} inset has positive area`);
    if (source.left <= safe.left && source.right >= safe.right) {
      if (source.top === 0) safe.top = Math.max(safe.top, source.bottom);
      else if (source.bottom === height) safe.bottom = Math.min(safe.bottom, source.top);
      else assert.fail(`Unsupported floating ${source.type} inset`);
    } else if (source.top <= safe.top && source.bottom >= safe.bottom) {
      if (source.left === 0) safe.left = Math.max(safe.left, source.right);
      else if (source.right === width) safe.right = Math.min(safe.right, source.left);
      else assert.fail(`Unsupported floating ${source.type} inset`);
    } else assert.fail(`Unsupported partial ${source.type} inset`);
  }
  return { safe, cutout: { left, top, right, bottom }, sources };
}
