import type { LinkItem } from "@retrodesk/shared";
import { i18n } from "../../../i18n";
import { safeHref } from "../types";

type Destination = Pick<LinkItem, "target" | "url" | "windowId">;

export type LinkDestinationSummary = {
  state: "ready" | "empty" | "invalid" | "missing";
  summary: string;
  hint: string;
};

/** Describes the existing URL/window contract without inventing a new destination type. */
export function linkDestinationSummary(link: Destination, windows: readonly { id: string; title: string }[]): LinkDestinationSummary {
  if (link.target === "window") {
    if (!link.windowId) return { state: "empty", summary: i18n.t("modules:linkDestinationSummary.noInSiteWindowChosen"), hint: i18n.t("modules:linkDestinationSummary.chooseTheWindowTheButton") };
    const target = windows.find((candidate) => candidate.id === link.windowId);
    if (!target) return { state: "missing", summary: i18n.t("modules:linkDestinationSummary.theTargetWindowNoLonger"), hint: i18n.t("modules:linkDestinationSummary.chooseAWindowAgainThis") };
    return { state: "ready", summary: i18n.t("modules:linkSummary.openWindow", { title: target.title || i18n.t("modules:linkSummary.untitledWindow") }), hint: i18n.t("modules:linkDestinationSummary.visitorsWillSeeThisWindow") };
  }

  const raw = link.url.trim();
  if (!raw || /^(?:https?:\/\/|mailto:)$/i.test(raw)) {
    return { state: "empty", summary: i18n.t("modules:linkDestinationSummary.noFullUrlSetYet"), hint: i18n.t("modules:linkDestinationSummary.pasteAWebsiteOrA") };
  }
  if (safeHref(raw) === "#") {
    return { state: "invalid", summary: i18n.t("modules:linkDestinationSummary.thisUrlFormatCantBe"), hint: i18n.t("modules:linkDestinationSummary.useAFullHttpHttps") };
  }

  const parsed = new URL(raw);
  return {
    state: "ready",
    summary: parsed.protocol === "mailto:" ? i18n.t("modules:linkDestinationSummary.email", { v1: parsed.pathname || raw }) : i18n.t("modules:linkDestinationSummary.url", { href: parsed.href }),
    hint: parsed.protocol === "mailto:" ? i18n.t("modules:linkDestinationSummary.opensInTheVisitorsEmail") : i18n.t("modules:linkDestinationSummary.opensInANewTab"),
  };
}
