import type { LinkDestination, NavigationCatalog, NavigationResult, ResolvedDestination } from "./linkDestination";
import { resolveLinkDestination } from "./resolveLinkDestination";
/** R1 exposes one activation, not a persisted action language or action sequence. */
export function dispatchUiActions(action: { kind: "openDestination"; destination: LinkDestination }, context: { editing: boolean; catalog: NavigationCatalog; open: (target: ResolvedDestination) => void }): NavigationResult {
  if (context.editing || action.kind !== "openDestination") return { ok: false, reason: "unavailable" };
  const target = resolveLinkDestination(action.destination, context.catalog);
  if (!target) return { ok: false, reason: "unavailable" };
  context.open(target);
  return { ok: true };
}
