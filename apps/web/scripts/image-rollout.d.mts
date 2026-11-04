export type ImageRelease = { enabled: boolean; webOrigin: string; apiOrigin: string };
export type ImageRollout = { enabled: boolean; webOrigin: string | null; apiOrigin: string | null };
export const IMAGE_STAGING_WEB_ORIGIN: string;
export const IMAGE_STAGING_API_ORIGIN: string;
export function validateImageRelease(config: unknown): ImageRelease;
export function readImageRelease(file: string | URL): ImageRelease;
export function configuredImageRollout(input: { command: string; mode: string; defaultConfig: string | URL }): ImageRollout;
export function resolveImageRollout(input: { command: string; mode: string; config: ImageRelease; apiOrigin?: string }): ImageRollout;
export function verifyImageArtifact(receipt: unknown, target: string): void;
