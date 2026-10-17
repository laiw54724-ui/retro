import { useId, useState } from "react";
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
  const feedbackPrefix = useId();
  const links = window.content.links;
  if (!links.length) return <div className="empty-module">還沒有連結</div>;
  return (
    <div className="links-body links-view">
      {links.map((link, index) => {
        // Older renderers omit the optional window directory; keep their existing
        // window callback working instead of mistaking an unknown target for deletion.
        const destination = link.target === "window" && link.windowId && !ctx.windows.length
          ? { state: "ready", summary: "開啟站內視窗" }
          : linkDestinationSummary(link, ctx.windows);
        const unavailable = destination.state !== "ready";
        const feedbackId = `${feedbackPrefix}-destination-${index}`;
        return (
          <div key={link.id} className="link-public-item">
            <button
              type="button"
              className="link-tile"
              style={{ background: link.color, color: readableOn(link.color), boxShadow: tileShadow }}
              disabled={unavailable}
              title={destination.summary}
              aria-describedby={unavailable ? feedbackId : undefined}
              onClick={() => { if (!unavailable) ctx.onLink({ target: link.target, url: link.url, windowId: link.windowId, label: link.label }); }}
            >
              <span className="link-icon"><Icon name={link.icon} size={24} /></span>
              <span className="link-label">{link.label.trim() || "未命名連結"}</span>
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const feedbackPrefix = useId();
  const links = window.content.links;
  const setLinks = (recipe: (list: LinkItem[]) => LinkItem[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, links: recipe(current.content.links) } }), key ? `links:${window.id}:${key}` : undefined);
  const patch = (id: string, change: Partial<LinkItem>, key?: string) => setLinks((list) => patchById(list, id, change), key);
  const otherWindows = ctx.windows.filter((candidate) => candidate.id !== window.id);

  return (
    <div className="links-body editing links-editor">
      {!links.length ? <p className="links-editor-empty">還沒有連結。新增一個按鈕，連到網站或站內視窗。</p> : null}
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
              <input className="link-input" value={link.label} maxLength={200} placeholder="按鈕文字" aria-label="按鈕文字" aria-invalid={!link.label.trim()} aria-describedby={!link.label.trim() ? labelHintId : undefined} style={{ color: fg, outlineColor: fg }} onChange={(event) => patch(link.id, { label: event.currentTarget.value }, `label:${link.id}`)} />
            </div>
            {!link.label.trim() ? <p id={labelHintId} className="link-destination is-problem">請填寫按鈕文字，讓訪客知道會開啟什麼。</p> : null}
            <div className="link-destination-row">
              <p id={feedbackId} className={`link-destination${destination.state !== "ready" ? " is-problem" : ""}`}>{destination.summary}</p>
              <MiniBtn label={`設定連結 ${link.label || index + 1}`} className="mini-btn wide" aria-expanded={expanded === link.id} aria-controls={settingsId} onClick={() => setExpanded(expanded === link.id ? null : link.id)}>{expanded === link.id ? "收合設定" : "設定"}</MiniBtn>
            </div>
            <div className="link-editor-actions">
              <MiniBtn label="上移" disabled={index === 0} onClick={() => setLinks((list) => moveById(list, link.id, -1))}>▲</MiniBtn>
              <MiniBtn label="下移" disabled={index === links.length - 1} onClick={() => setLinks((list) => moveById(list, link.id, 1))}>▼</MiniBtn>
              <span className="link-order">第 {index + 1} 個連結</span>
              <MiniBtn label="刪除" danger onClick={() => setLinks((list) => list.filter((item) => item.id !== link.id))}>刪除</MiniBtn>
            </div>
            <div id={settingsId} className="link-settings-panel" hidden={expanded !== link.id}>
              <fieldset>
                <legend>目的地</legend>
                <div className="link-target-types">
                  <MiniBtn label="連到網址" className="mini-btn wide" on={link.target === "url"} aria-pressed={link.target === "url"} onClick={() => patch(link.id, { target: "url" })}>網址</MiniBtn>
                  <MiniBtn label="連到站內視窗" className="mini-btn wide" on={link.target === "window"} aria-pressed={link.target === "window"} onClick={() => patch(link.id, { target: "window" })}>站內視窗</MiniBtn>
                </div>
                {link.target === "url"
                  ? <label><span>連結網址</span><input className="ie" value={link.url} maxLength={2048} placeholder="https://" aria-label="連結網址" aria-invalid={destination.state === "invalid"} aria-describedby={feedbackId} onChange={(event) => patch(link.id, { url: event.currentTarget.value }, `url:${link.id}`)} /></label>
                  : <label><span>站內視窗</span><select className="w98-select" value={link.windowId} aria-label="站內視窗" aria-invalid={destination.state === "missing"} aria-describedby={feedbackId} onChange={(event) => patch(link.id, { windowId: event.currentTarget.value })}>
                    <option value="">選擇視窗…</option>
                    {link.windowId && !otherWindows.some((candidate) => candidate.id === link.windowId) ? <option value={link.windowId} disabled>{link.windowId === window.id ? "目前的視窗" : "已刪除的視窗"}</option> : null}
                    {otherWindows.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title || "未命名視窗"}</option>)}
                  </select></label>}
                <p className="link-settings-hint">{destination.hint}</p>
              </fieldset>
              <fieldset>
                <legend>按鈕外觀</legend>
                <div className="link-colors">
                  {COLORS.map((color) => <button key={color} type="button" aria-label={`顏色 ${color}`} aria-pressed={link.color === color} className="swatch" style={{ background: color, outline: link.color === color ? "2px solid #000" : "none" }} onClick={() => patch(link.id, { color })} />)}
                  <label className="swatch rainbow" title="自訂顏色"><input type="color" value={link.color} aria-label="自訂顏色" onChange={(event) => patch(link.id, { color: event.currentTarget.value }, `color:${link.id}`)} /></label>
                </div>
                <p className="link-settings-hint">點選按鈕左側的圖示可更換圖示。</p>
              </fieldset>
            </div>
          </div>
        );
      })}
      <button type="button" className="ie-add" disabled={links.length >= 100} onClick={() => { const link = makeLink({ label: "新連結", url: "" }); setLinks((list) => list.length < 100 ? [...list, link] : list); setExpanded(link.id); }}>＋ 新增連結</button>
      {links.length >= 100 ? <p className="link-settings-hint">已達 100 個連結上限。</p> : null}
    </div>
  );
}
