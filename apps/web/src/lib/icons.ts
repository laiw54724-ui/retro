// Pixel-style 32x32 icons from the v2 design handoff.
const K = 'stroke="#000000" stroke-width="2"';

export const ICON_SVG_BODIES: Record<string, string> = {
  doc: `<path d="M7 3h13l6 6v20H7z" fill="#fff" ${K}/><path d="M20 3v6h6" fill="#c0c0c0" ${K}/><path d="M11 14h11M11 18h11M11 22h8" stroke="#000080" stroke-width="2"/>`,
  folder: `<path d="M3 8h10l3 3h13v16H3z" fill="#ffd166" ${K}/><path d="M3 14h26" ${K}/>`,
  photo: `<rect x="3" y="6" width="26" height="20" fill="#fff" ${K}/><rect x="6" y="9" width="20" height="14" fill="#9fd8f5"/><path d="M6 23l7-8 5 5 3-3 5 6z" fill="#3fa36b"/><rect x="20" y="11" width="3" height="3" fill="#ffd166"/>`,
  link: `<circle cx="16" cy="16" r="12" fill="#7cc4f0" ${K}/><path d="M4 16h24M16 4c-6 6-6 18 0 24M16 4c6 6 6 18 0 24" fill="none" stroke="#000000" stroke-width="1.5"/>`,
  user: `<rect x="3" y="6" width="26" height="20" fill="#fff" ${K}/><rect x="7" y="10" width="9" height="10" fill="#f48fb1"/><rect x="9" y="11" width="5" height="4" fill="#000000"/><path d="M19 11h7M19 15h7M19 19h5M7 22h9" stroke="#000000" stroke-width="2"/>`,
  heart: `<path d="M16 27 5 16c-3-3-3-8 0-10 3-3 7-2 9 1l2 2 2-2c2-3 6-4 9-1 3 2 3 7 0 10z" fill="#f06292" ${K}/><rect x="8" y="9" width="3" height="3" fill="#fff"/>`,
  star: `<path d="M16 3l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#ffd166" ${K} stroke-linejoin="round"/>`,
  mail: `<rect x="3" y="8" width="26" height="17" fill="#fff" ${K}/><path d="M3 8l13 10 13-10" fill="none" ${K}/>`,
  music: `<path d="M12 7l14-4v18M12 7v17" fill="none" ${K}/><ellipse cx="9" cy="24" rx="4" ry="3" fill="#ba68c8" ${K}/><ellipse cx="23" cy="21" rx="4" ry="3" fill="#ba68c8" ${K}/>`,
  computer: `<rect x="4" y="4" width="24" height="17" fill="#c0c0c0" ${K}/><rect x="7" y="7" width="18" height="11" fill="#000080"/><rect x="9" y="9" width="5" height="2" fill="#f8bbd0"/><path d="M10 24h12v4H10z" fill="#c0c0c0" ${K}/>`,
  palette: `<path d="M16 4C9 4 4 9 4 15c0 6 5 12 11 12 2 0 3-1 3-3s-2-3 0-5 7 1 9-3c2-7-4-12-11-12z" fill="#fff3e0" ${K}/><rect x="9" y="12" width="4" height="4" fill="#f06292"/><rect x="14" y="8" width="4" height="4" fill="#ffd166"/><rect x="20" y="10" width="4" height="4" fill="#4fc3f7"/>`,
  camera: `<rect x="3" y="9" width="26" height="18" fill="#d0d0d0" ${K}/><rect x="10" y="5" width="12" height="5" fill="#d0d0d0" ${K}/><circle cx="16" cy="18" r="5" fill="#1084d0" ${K}/><rect x="23" y="12" width="3" height="2" fill="#ffd166"/>`,
  trash: `<path d="M7 9h18l-2 19H9z" fill="#e0e0e0" ${K}/><path d="M5 9h22M12 5h8v4M13 13v11M19 13v11" fill="none" ${K}/>`,
};

export const BUILTIN_ICON_KEYS = Object.keys(ICON_SVG_BODIES);
export type BuiltinIconKey = keyof typeof ICON_SVG_BODIES;

const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">${body}</svg>`;

/** Data-URI CSS background for a built-in icon key. */
export function builtinIconBackground(key: string): string {
  const body = ICON_SVG_BODIES[key] ?? ICON_SVG_BODIES.doc;
  return `url("data:image/svg+xml,${encodeURIComponent(wrap(body))}") center / contain no-repeat`;
}

/** Only http(s) image URLs are ever used as an icon source. */
export function isImageIcon(value: string): boolean {
  return /^https:\/\//i.test(value) || /^http:\/\/localhost[:/]/i.test(value) || /^\/win98-icons\/[A-Za-z0-9._-]+\.png$/i.test(value);
}

/** Escapes a URL so it can sit inside CSS url("...") without breaking out of it. */
export function cssUrl(url: string): string {
  return `url("${url.replace(/["()\\\s]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))}")`;
}

/** CSS background for an icon value: a built-in key or an uploaded/linked image URL. */
export function iconBackground(value: string | undefined | null): string {
  if (!value) return builtinIconBackground("doc");
  if (ICON_SVG_BODIES[value]) return builtinIconBackground(value);
  if (isImageIcon(value)) return `${cssUrl(value)} center / contain no-repeat`;
  return builtinIconBackground("doc");
}
