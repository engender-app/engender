/* Every piece of type on a screen, measured against what is actually behind
   it (DIRECTION.md rule 11).

   Rule 11 computes the eight field/ink pairs from the hexes, and
   palette-contrast.test.ts holds them at the 3:1 large-text floor. That is
   the palette's arithmetic; this is the screen's. The two things a table
   cannot answer are what an element's effective background really is once a
   fill, a wash or a role has been resolved, and which of the two floors
   applies once a browser has laid the type out at whatever size the cascade
   actually gave it.

   Written once and read by two walkers, which is redesign ticket 34's own
   finding: setup and the gates wear one field (rules 12 and 15), so a
   measurement that had to know how a field paints could not be two
   measurements. tests/setup-contrast.mjs walks setup's ten steps in the app;
   tests/gate-contrast.mjs walks the gates in their fixture.

   Large text answers to 3:1 and anything smaller to 4.5:1 (WCAG 1.4.3); the
   boundary is 24px, or 18.66px at weight 700 or more, which is the same
   floor tests/direction-contract.test.ts uses. */

/**
 * The measurement, as a function to hand to `page.evaluate`. Takes the
 * selector of the screen to walk, so a caller measures its own screen and
 * nothing else on the page.
 */
export const MEASURE = (rootSelector) => {
  const parse = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const chan = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /* A translucent layer over what is behind it, which is what a wash and a
     scrim are: composited rather than ignored, or a 12% accent fill would be
     read as the surface under it. */
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1
  });
  const behind = (el) => {
    let stack = [];
    /* The field paints nothing (redesign tickets 28 and 33): its colour is a
       sibling block a window tall whose bottom edge is a clip, which is what
       lets the edge move without the box being resized. So climbing the
       ancestors from the title would walk straight past the flag colour and
       land on the page - measured genderfluid's white question at 1.07:1
       against a light page it is not drawn on. Anything inside a field is
       measured against that field's own paint.

       `.step-field` is the shared class setup and the gates both wear
       (redesign ticket 34), so the one lookup answers both; `.screen-field`
       is a door's, where the paint is a child rather than a sibling and the
       climb below would find it anyway. */
    const field = el.closest('.step-field');
    if (field) {
      const paint = parse(getComputedStyle(field.querySelector('.step-field-paint')).backgroundColor);
      if (paint) stack.push(paint);
    }
    for (let node = el; node && stack.every((b) => b.a < 1); node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (!bg || bg.a === 0) continue;
      stack.push(bg);
      if (bg.a === 1) break;
    }
    /* The page itself, where nothing above it painted anything solid. */
    let base = parse(getComputedStyle(document.body).backgroundColor) ?? {
      r: 255,
      g: 255,
      b: 255,
      a: 1
    };
    for (const layer of stack.reverse()) base = over(layer, base);
    return base;
  };

  const results = [];
  for (const el of document.querySelectorAll(`${rootSelector} *`)) {
    const own = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (!own) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) < 0.9) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    const ink = parse(style.color);
    if (!ink) continue;
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    results.push({
      what: `${el.tagName.toLowerCase()}.${(el.className.toString().split(' ')[0] || '-')}`,
      text: el.textContent.trim().slice(0, 28),
      size: Math.round(size * 10) / 10,
      weight,
      floor: large ? 3 : 4.5,
      ratio: Math.round(ratio(ink, behind(el)) * 100) / 100
    });
  }
  return results;
};
