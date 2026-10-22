import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../../components/Icon";
import { readableOn } from "../../../lib/themeView";
import { type ModuleProps } from "../types";
import { linkDestinationSummary } from "./linkDestinationSummary";
import "./editor.css";

export { LinksInlineEditor } from "./InlineEditor";

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
