/** Transport-only preservation contract. It is not authentication or a document field. */
export const APPEARANCE_WRITE_CONTRACT = 1;
const p2WindowColors = ["titleText", "frameColor", "contentBackground", "contentText", "desktopLabelText", "desktopLabelBackground"] as const;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Inspect raw input/stored JSON before parsers can strip keys or fill defaults. */
export function requiresAppearanceContract(document: unknown): boolean {
  if (!record(document)) return false;
  if (record(document.theme) && Object.hasOwn(document.theme, "appearance")) return true;
  return Array.isArray(document.windows) && document.windows.some((window: unknown) => {
    if (!record(window) || !Object.hasOwn(window, "appearance")) return false;
    const appearance = window.appearance;
    if (!record(appearance)) return appearance !== undefined;
    return p2WindowColors.some((key) => Object.hasOwn(appearance, key))
      || !Object.hasOwn(appearance, "titleFrom") || !Object.hasOwn(appearance, "titleTo");
  });
}

export function hasAppearanceContract(value: unknown): boolean {
  return value === APPEARANCE_WRITE_CONTRACT;
}
export function appearanceWriteBlocked(incoming: unknown, stored: unknown, capability: unknown): boolean {
  return !hasAppearanceContract(capability) && (requiresAppearanceContract(incoming) || requiresAppearanceContract(stored));
}
export const APPEARANCE_UPGRADE_MESSAGE = "This editor must be upgraded before saving appearance data. Your local edits have not been replaced.";
