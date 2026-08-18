/* Lucide-style 24px/2px-stroke icon set, inlined (ISC-licensed path data style).
   The app deliberately inlines SVG so icons colour via currentColor tokens. */

const PATHS: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 9h18"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L7 20"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="3"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  tag: '<path d="M2 11.5V4a2 2 0 0 1 2-2h7.5L21 11.5a2.1 2.1 0 0 1 0 3L14.5 21a2.1 2.1 0 0 1-3 0z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  flag: '<path d="M4 22V3"/><path d="M4 4h13l-2.5 4L17 12H4"/>',
  flask: '<path d="M10 2v7L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V2"/><path d="M8 2h8M7.5 15h9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="M6 7l1 13a2 2 0 0 0 2 1.8h6A2 2 0 0 0 17 20l1-13"/><path d="M10 11.5v5M14 11.5v5"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.7 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.9 17.9 0 0 1-2.2 3.2M6.6 6.6C3.8 8.5 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="m2 2 20 20"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/>',
  heart: '<path d="M19.5 5a5 5 0 0 0-7.5.7A5 5 0 0 0 4.5 5c-2 2-2 5.1 0 7.1L12 20l7.5-7.9c2-2 2-5.1 0-7.1z"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  fingerprint: '<path d="M12 11a3 3 0 0 0-3 3c0 2.5-.5 4.5-1.4 6"/><path d="M15 14.5c0 2-.3 4-1 5.5"/><path d="M17.8 12.3A6 6 0 0 0 6.7 9.2"/><path d="M5 13c-.2 1.5-.5 3-1.2 4.3"/><path d="M8.7 5.1A9 9 0 0 1 21 13.2"/><path d="M3.5 9A9 9 0 0 1 5 6.5"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v4M12 17.5v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11.5V16"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"/>',
  palette: '<path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1.7-.5 2.2a4 4 0 0 1-2 .5z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18"/>',
  timeline: '<circle cx="12" cy="5" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M12 7.2v9.6"/>',
  shuffle: '<path d="M2 18h3.5a4 4 0 0 0 3.2-1.6l6.6-8.8A4 4 0 0 1 18.5 6H22"/><path d="M2 6h3.5a4 4 0 0 1 3.2 1.6l.9 1.2M14 15l1.3 1.4a4 4 0 0 0 3.2 1.6H22"/><path d="m19 3 3 3-3 3M19 15l3 3-3 3"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.5 11.5 8-8M17 6l2.5 2.5M14 9l2 2"/>',
  backspace: '<path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z"/><path d="m11 9.5 5 5M16 9.5l-5 5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M20 17v5H6.5a2.5 2.5 0 0 1 0-5"/>',
  zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  ruler: '<path d="M3 8h18v8H3z"/><path d="M7 8v3M11 8v3M15 8v3"/>',
  comb: '<path d="M4 3h16v4H4z"/><path d="M6 7v13M9.5 7v10M13 7v13M16.5 7v10M20 7v13"/>',
  package:
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>'
};

export function icon(name: string, size = 24, cls = ''): string {
  const d = PATHS[name] || PATHS.info;
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}
