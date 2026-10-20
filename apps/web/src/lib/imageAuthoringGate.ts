export type ImageStagingRelease = { enabled: boolean; webOrigin: string | null; apiOrigin: string | null };

/** UI/build rollout only. Site/API compatibility and API authorization remain independent. */
export function imageAuthoringAllowed(input: {
  dev: boolean; devServer: boolean; mode: string; ordinaryFlag?: string; release: ImageStagingRelease;
  webOrigin?: string; apiOrigin?: string;
}): boolean {
  if (input.dev && input.devServer && input.mode === "development") return input.ordinaryFlag === "true";
  return !input.dev && !input.devServer && input.mode === "staging" && input.release.enabled === true &&
    input.release.webOrigin === "https://retrodesk-staging.pages.dev" &&
    input.release.apiOrigin === "https://retrodesk-api-staging.beibeiz.workers.dev" &&
    input.webOrigin === input.release.webOrigin && input.apiOrigin === input.release.apiOrigin;
}
