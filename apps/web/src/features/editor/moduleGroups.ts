import type { DesktopWindow } from "@retrodesk/shared";
import type { moduleDefinitions } from "../modules/registry";

type Module = (typeof moduleDefinitions)[number];
const purposes = {
  writing: ["about", "document", "links"],
  visual: ["instagram", "gallery", "image", "moodboard"],
  interaction: ["music", "character-dialog", "guestbook", "minesweeper"],
  organize: ["explorer"],
} satisfies Record<string, DesktopWindow["type"][]>;

/** Group only the caller's available registry entries; never enable a module here. */
export function groupModules(available: readonly Module[], imageWriter: boolean) {
  return (Object.keys(purposes) as Array<keyof typeof purposes>).map(id => ({
    id,
    modules: purposes[id].flatMap(type => available.filter(module => module.type === type && (type !== "image" || imageWriter))),
  })).filter(group => group.modules.length > 0);
}
