import { LegacyLinkTargetButton } from "../../navigation/LegacyLinkTargetButton";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeLink, type LinkItem } from "@retrodesk/shared";
import { Icon } from "../../../components/Icon";
import { readableOn } from "../../../lib/themeView";
import { MiniBtn } from "../ui";
import { IconPickerButton } from "./IconPicker";
import { moveById, patchById, type ModuleProps } from "../types";
import { linkDestinationSummary } from "./linkDestinationSummary";
import "./editor.css";

const COLORS = ["#000080", "#5b3fa8", "#1565c0", "#1f7a5c", "#bf360c", "#000000"];

const tileShadow = "inset -2px -2px rgba(0,0,0,.35), inset 2px 2px rgba(255,255,255,.4)";

export function LinksView({ window, ctx }: ModuleProps<"links">) {
  const { t: tr } = useTranslation("modules");
  const feedbackPrefix = useId();
  const links = window.content.links;
  if (!links.length) return <div className="empty-module">{tr("links.noLinksYet")}</div>;
  return (
    <div className="links-body links-view">
      {links.map((link, index) => {
        // Older renderers omit the optional window directory; keep their existing
        // window callback working instead of mistaking an unknown target for deletion.
        const destination = link.target === "window" && link.windowId && !ctx.windows.length
          ? { state: "ready", summary: tr("links.openInSiteWindow") }
          : linkDestinationSummary(link, ctx.windows);
        const unavailable = destination.state !== "ready";
        const feedbackId = `${feedbackPrefix}-destination-${index}`;
        return (
          <div key={link.id} className="link-public-item">
            <button
              type="button"
              className="link-tile"
              data-navigation-focus={`links:${window.id}:${link.id}`}
              style={{ background: link.color, color: readableOn(link.color), boxShadow: tileShadow }}
              disabled={unavailable}
              title={destination.summary}
              aria-describedby={unavailable ? feedbackId : undefined}
              onClick={() => { if (!unavailable) ctx.onLink({ target: link.target, url: link.url, windowId: link.windowId, label: link.label }); }}
            >
              <span className="link-icon"><Icon name={link.icon} size={24} /></span>
              <span className="link-label">{link.label.trim() || tr("links.untitledLink")}</span>
              <span aria-hidden="true">{link.target === "window" ? "▸" : "↗"}</span>
            </button>
            {unavailable ? <p id={feedbackId} className="link-destination is-problem">{destination.summary}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function LinksInlineEditor({ window, ctx, update }: ModuleProps<"links">) {
  const { t: tr } = useTranslation("modules");
  const [expanded, setExpanded] = useState<string | null>(null);
  const feedbackPrefix = useId();
  const links = window.content.links;
  const setLinks = (recipe: (list: LinkItem[]) => LinkItem[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, links: recipe(current.content.links) } }), key ? `links:${window.id}:${key}` : undefined);
  const patch = (id: string, change: Partial<LinkItem>, key?: string) => setLinks((list) => patchById(list, id, change), key);
  const otherWindows = ctx.windows.filter((candidate) => candidate.id !== window.id);

  return (
    <div className="links-body editing links-editor">
      {!links.length ? <p className="links-editor-empty">{tr("links.noLinksYetAddA")}</p> : null}
      {links.map((link, index) => {
        const fg = readableOn(link.color);
        const destination = linkDestinationSummary(link, ctx.windows);
        const settingsId = `${feedbackPrefix}-settings-${index}`;
        const feedbackId = `${feedbackPrefix}-destination-${index}`;
        const labelHintId = `${feedbackPrefix}-label-${index}`;
        return (
          <div key={link.id} className="ie-box link-editor-card" data-link-id={link.id}>
            <div className="link-tile edit" style={{ background: link.color, color: fg, boxShadow: tileShadow }}>
              <IconPickerButton siteId={ctx.siteId} value={link.icon} upload={ctx.upload} mediaTarget={{ windowId: window.id, windowType: "links", itemId: link.id }} label={link.label} defaultValue="link" onChange={(value) => patch(link.id, { icon: value, iconUrl: value.startsWith("http") ? value : "" })} />
              <input className="link-input" value={link.label} maxLength={200} placeholder={tr("document.buttonText")} aria-label={tr("document.buttonText")} aria-invalid={!link.label.trim()} aria-describedby={!link.label.trim() ? labelHintId : undefined} style={{ color: fg, outlineColor: fg }} onChange={(event) => patch(link.id, { label: event.currentTarget.value }, `label:${link.id}`)} />
            </div>
            {!link.label.trim() ? <p id={labelHintId} className="link-destination is-problem">{tr("links.enterTheButtonTextSo")}</p> : null}
            <div className="link-destination-row">
              <p id={feedbackId} className={`link-destination${destination.state !== "ready" ? " is-problem" : ""}`}>{destination.summary}</p>
              <MiniBtn label={tr("links.settingsForLink", { v1: link.label || index + 1 })} className="mini-btn wide" aria-expanded={expanded === link.id} aria-controls={settingsId} onClick={() => setExpanded(expanded === link.id ? null : link.id)}>{expanded === link.id ? tr("links.collapseSettings") : tr("links.settings")}</MiniBtn>
            </div>
            <div className="link-editor-actions">
              <MiniBtn label={tr("document.moveUp")} disabled={index === 0} onClick={() => setLinks((list) => moveById(list, link.id, -1))}>▲</MiniBtn>
              <MiniBtn label={tr("document.moveDown")} disabled={index === links.length - 1} onClick={() => setLinks((list) => moveById(list, link.id, 1))}>▼</MiniBtn>
              <span className="link-order">{tr("links.linkN", { n: index + 1 })}</span>
              <MiniBtn label={tr("links.delete")} danger onClick={() => setLinks((list) => list.filter((item) => item.id !== link.id))}>{tr("links.delete")}</MiniBtn>
            </div>
            <div id={settingsId} className="link-settings-panel" hidden={expanded !== link.id}>
              <fieldset>
                <legend>{tr("links.destination")}</legend>
                <LegacyLinkTargetButton link={link} windows={otherWindows} onApply={(change) => patch(link.id, change)} />
                <p className="link-settings-hint">{destination.hint}</p>
              </fieldset>
              <fieldset>
                <legend>{tr("links.buttonStyle")}</legend>
                <div className="link-colors">
                  {COLORS.map((color) => <button key={color} type="button" aria-label={tr("links.color", { color })} aria-pressed={link.color === color} className="swatch" style={{ background: color, outline: link.color === color ? "2px solid #000" : "none" }} onClick={() => patch(link.id, { color })} />)}
                  <label className="swatch rainbow" title={tr("links.customColor")}><input type="color" value={link.color} aria-label={tr("links.customColor")} onChange={(event) => patch(link.id, { color: event.currentTarget.value }, `color:${link.id}`)} /></label>
                </div>
                <p className="link-settings-hint">{tr("links.clickTheIconOnThe")}</p>
              </fieldset>
            </div>
          </div>
        );
      })}
      <button type="button" className="ie-add" disabled={links.length >= 100} onClick={() => { const link = makeLink({ label: tr("links.newLink"), url: "" }); setLinks((list) => list.length < 100 ? [...list, link] : list); setExpanded(link.id); }}>{tr("links.addLink")}</button>
      {links.length >= 100 ? <p className="link-settings-hint">{tr("links.youveReachedTheLimitOf")}</p> : null}
    </div>
  );
}
