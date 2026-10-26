import { z } from "zod";

export const ASSET_REFERENCE_PREFIX = "retro-asset:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AssetReferenceSchema = z.string().length(ASSET_REFERENCE_PREFIX.length + 36).regex(/^retro-asset:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "Invalid asset reference");
export type AssetReference = z.infer<typeof AssetReferenceSchema>;

/** UUID identity is case-insensitive; never normalize arbitrary URLs or text. */
export function normalizeAssetId(value: unknown): string | null {
  return typeof value === "string" && value.length === 36 && UUID.test(value) ? value.toLowerCase() : null;
}

export function createAssetReference(id: string): AssetReference {
  const normalized = normalizeAssetId(id);
  if (!normalized) throw new Error("Invalid asset id");
  return `${ASSET_REFERENCE_PREFIX}${normalized}` as AssetReference;
}

export function parseAssetReference(value: unknown): string | null {
  if (typeof value !== "string" || value.slice(0, ASSET_REFERENCE_PREFIX.length).toLowerCase() !== ASSET_REFERENCE_PREFIX) return null;
  return normalizeAssetId(value.slice(ASSET_REFERENCE_PREFIX.length));
}

export function isAssetReference(value: unknown): value is AssetReference {
  return parseAssetReference(value) !== null;
}

export function collectAssetReferences(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown) => {
    if (typeof node === "string") {
      const id = parseAssetReference(node);
      if (id) found.add(id);
      return;
    }
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node && typeof node === "object") Object.values(node).forEach(visit);
  };
  visit(value);
  return [...found];
}

export function replaceAssetReferences<T>(value: T, replacements: ReadonlyMap<string, string>): T {
  const visit = (node: unknown): unknown => {
    if (typeof node === "string") {
      const id = parseAssetReference(node);
      return id && replacements.has(id) ? replacements.get(id) : node;
    }
    if (Array.isArray(node)) return node.map(visit);
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, visit(item)]));
    return node;
  };
  return visit(value) as T;
}

export function replaceExactStrings<T>(value: T, replacements: ReadonlyMap<string, string>): T {
  const visit = (node: unknown): unknown => {
    if (typeof node === "string") return replacements.get(node) ?? node;
    if (Array.isArray(node)) return node.map(visit);
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, visit(item)]));
    return node;
  };
  return visit(value) as T;
}
