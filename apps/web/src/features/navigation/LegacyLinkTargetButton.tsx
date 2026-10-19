import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LinkItem } from "@retrodesk/shared";
import { LinkTargetPicker } from "./LinkTargetPicker";
export function LegacyLinkTargetButton({ link, windows, onApply }: { link: LinkItem; windows: readonly { id: string; title: string }[]; onApply: (patch: Partial<LinkItem>) => void }) {
  const { t } = useTranslation("modules");
  const [open, setOpen] = useState(false);
  return <><button type="button" className="w98-btn" onClick={() => setOpen(true)}>{t("navigationTargets.choose")}</button>{open ? <LinkTargetPicker title={t("links.destination")} allowUrl options={windows.map((window) => ({ kind: "window", id: window.id, label: window.title, group: t("links.inSiteWindow") }))} initial={link.target === "url" ? { kind: "url", url: link.url } : { kind: "target", targetKind: "window", id: link.windowId, url: link.url }} onClose={() => setOpen(false)} onRemove={() => { onApply({ target: "url", url: "", windowId: "" }); setOpen(false); }} onApply={(value) => { onApply(value.kind === "url" ? { target: "url", url: value.url } : { target: "window", windowId: value.option.id }); setOpen(false); }} /> : null}</>;
}
