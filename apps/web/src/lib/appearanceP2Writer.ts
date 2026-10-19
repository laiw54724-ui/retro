/** Local opt-in only until the API/client preservation handshake is implemented.
 * Production stays off even with the build flag: reader deployment and manual
 * tab refresh do not exclude stale clients. See the writer compatibility plan. */
export const APPEARANCE_P2_WRITER_ENABLED = import.meta.env.DEV && import.meta.env.VITE_APPEARANCE_P2_WRITER === "true";
