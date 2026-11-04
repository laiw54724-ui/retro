import { i18n } from "./index";

/** Display name of a built-in theme preset in the current UI language. Custom or unknown themes keep their own name. */
export function themeLabel(theme: { id: string; name: string }): string {
  const key = `common:themes.${theme.id}`;
  return i18n.exists(key) ? String(i18n.t(key as never)) : theme.name;
}
