/** Transport version of this client's verified appearance-preserving readers. */
export const CLIENT_APPEARANCE_CONTRACT = 1;
export type AppearanceApiLoad = { siteId: string; apiOrigin: string; writeCompatibility: unknown };
export function supportsAppearanceContract(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).appearanceP2 === CLIENT_APPEARANCE_CONTRACT;
}
export function compatibleAppearanceLoad(siteId: string, apiOrigin: string, load: AppearanceApiLoad | null): boolean {
  return !!load && load.siteId === siteId && load.apiOrigin === apiOrigin && supportsAppearanceContract(load.writeCompatibility);
}
