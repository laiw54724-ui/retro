import { ICON_LIBRARY_IDS, ICON_LIBRARY_SETS } from "./ids.generated";

/**
 * Stable ids of the bundled open icon library look like `haiku:folder`. They never contain an array index or an
 * upstream URL, so a saved site keeps its icon when the catalog grows, is reordered, or is re-imported.
 */
const KNOWN = new Set<string>(ICON_LIBRARY_IDS);
const SHAPE = /^([a-z0-9]+):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Old id -> current id. Add a line here whenever an icon is renamed or merged, and leave it forever.
 * An id that is neither current nor listed (an icon that was removed) falls back to a built-in icon by name.
 */
export const ICON_ID_ALIASES: Readonly<Record<string, string>> = {};

export type LibrarySetId = keyof typeof ICON_LIBRARY_SETS;

/** True when the value has the `set:name` shape of a library id, whether or not that icon still exists. */
export function hasLibraryIdShape(value: string | null | undefined): value is string {
  const match = value ? SHAPE.exec(value) : null;
  return !!match && match[1] in ICON_LIBRARY_SETS;
}

export function resolveLibraryId(value: string): string | null {
  let current = value;
  for (let hop = 0; hop < 5; hop += 1) {
    if (KNOWN.has(current)) return current;
    const next = ICON_ID_ALIASES[current];
    if (!next) return null;
    current = next;
  }
  return null;
}

export interface LibraryIcon { id: string; set: LibrarySetId; name: string; url: string; pixel: boolean }

/** Same-origin, versionless URL of a bundled library icon, or null when the id is unknown (removed or never existed). */
export function resolveLibraryIcon(value: string | null | undefined): LibraryIcon | null {
  if (!hasLibraryIdShape(value)) return null;
  const id = resolveLibraryId(value);
  if (!id) return null;
  const [set, name] = id.split(":") as [LibrarySetId, string];
  const meta = ICON_LIBRARY_SETS[set];
  return { id, set, name, url: `/icon-library/${set}/${name}.${meta.ext}`, pixel: set === "pixelart" };
}

/** The part after the colon, used to pick a semantic built-in fallback for an unknown id. */
export function libraryNameOf(value: string): string {
  return SHAPE.exec(value)?.[2] ?? value;
}
