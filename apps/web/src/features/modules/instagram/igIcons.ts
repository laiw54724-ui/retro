const cache = new Map<string, Record<string, string>>();

/** Line icons for the Instagram UI, drawn in `color` (the theme text colour). */
export function igIcons(color: string): Record<string, string> {
  const hit = cache.get(color);
  if (hit) return hit;
  const S = (body: string, stroke?: string, fill?: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${fill ?? "none"}' stroke='${stroke ?? color}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`)}") center / contain no-repeat`;
  const heart = "<path d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z'/>";
  const bookmark = "<path d='M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'/>";
  const dots = `<circle cx='5' cy='12' r='1.3' fill='${color}'/><circle cx='12' cy='12' r='1.3' fill='${color}'/><circle cx='19' cy='12' r='1.3' fill='${color}'/>`;
  const home = "<path d='M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z'/>";
  const icons = {
    heart: S(heart), heartFill: S(heart, "#e0245e", "#e0245e"), heartWhite: S(heart, "#ffffff", "#ffffff"),
    comment: S("<path d='M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z'/>"),
    send: S("<path d='M22 2 11 13'/><path d='M22 2 15 22l-4-9-9-4z'/>"),
    bookmark: S(bookmark), bookmarkFill: S(bookmark, color, color),
    home: S(home), homeFill: S(home, color, color),
    search: S("<circle cx='11' cy='11' r='7'/><path d='M21 21l-4.3-4.3'/>"),
    grid: S("<rect x='3' y='3' width='18' height='18'/><path d='M3 9h18M3 15h18M9 3v18M15 3v18'/>"),
    list: S("<rect x='3' y='3' width='18' height='8'/><rect x='3' y='14' width='18' height='7'/>"),
    collections: S("<path d='M3 7h7l2 2h9v11H3z'/><path d='M3 7V4h7l2 2h7v3'/>"),
    back: S("<path d='M15 18l-6-6 6-6'/>"),
    more: S(dots, "none"),
    multi: S("<rect x='7' y='3' width='14' height='14'/><path d='M3 7v14h14'/>", "#ffffff"),
    camera: S("<rect x='3' y='6' width='18' height='14' rx='2'/><circle cx='12' cy='13' r='4'/><path d='M8 6l2-3h4l2 3'/>")
  };
  cache.set(color, icons);
  return icons;
}
