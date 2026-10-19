import type { DesktopWindow } from "@retrodesk/shared";
export type WindowAppearance = NonNullable<DesktopWindow["appearance"]>;

/** Deletion means inheritance; never copy unrelated resolved defaults into data. */
export function patchAppearance<K extends keyof WindowAppearance>(appearance: WindowAppearance | undefined, field: K, value: WindowAppearance[K]): WindowAppearance | undefined {
  const next = { ...appearance };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return Object.keys(next).length ? next : undefined;
}

export function resetTitleAppearance(appearance?: WindowAppearance): WindowAppearance | undefined {
  const { titleFrom: _from, titleTo: _to, titleGradient: _gradient, titleText: _text, ...rest } = appearance ?? {};
  return Object.keys(rest).length ? rest : undefined;
}
