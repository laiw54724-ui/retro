/** Release guard only. Enable after the deployed reader canary and stale-client
 * protection in the P2 release plan have been verified by the release owner. */
export const APPEARANCE_P2_WRITER_ENABLED = import.meta.env.VITE_APPEARANCE_P2_WRITER === "true";
