import { useState } from "react";
import { makeLink, type LinkItem } from "@retrodesk/shared";
import { Icon } from "../../../components/Icon";
import { readableOn } from "../../../lib/themeView";
import { MiniBtn } from "../ui";
import { IconPicker } from "./IconPicker";
import { moveById, patchById, type ModuleProps } from "../types";

const COLORS = ["#000080", "#5b3fa8", "#1565c0", "#1f7a5c", "#bf360c", "#000000"];

const tileShadow = "inset -2px -2px rgba(0,0,0,.35), inset 2px 2px rgba(255,255,255,.4)";

export function LinksView({ window, ctx }: ModuleProps<"links">) {
  const links = window.content.links;
  if (!links.length) return <div className="empty-module">還沒有連結</div>;
  return (
    <div className="links-body">
      {links.map((link) => (
        <button
          type="button"
          key={link.id}
          className="link-tile"
          style={{ background: link.color, color: readableOn(link.color), boxShadow: tileShadow }}
          onClick={() => ctx.onLink({ target: link.target, url: link.url, windowId: link.windowId, label: link.label })}
        >
          <span className="link-icon"><Icon name={link.icon} size={24} /></span>
          <span className="link-label">{link.label}</span>
          <span aria-hidden="true">{link.target === "window" ? "▸" : "↗"}</span>
        </button>
      ))}
    </div>
  );
}

export function LinksInlineEditor({ window, ctx, update }: ModuleProps<"links">) {
  const [picking, setPicking] = useState<string | null>(null);
  const links = window.content.links;
  const setLinks = (recipe: (list: LinkItem[]) => LinkItem[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, links: recipe(current.content.links) } }), key);
  const patch = (id: string, change: Partial<LinkItem>, key?: string) => setLinks((list) => patchById(list, id, change), key);
  const otherWindows = ctx.windows.filter((candidate) => candidate.id !== window.id);

  return (
    <div className="links-body editing">
      {links.map((link, index) => {
        const fg = readableOn(link.color);
        return (
          <div key={link.id} className="ie-box">
            <div className="link-tile edit" style={{ background: link.color, color: fg, boxShadow: tileShadow }}>
              <button type="button" className="link-icon btn" aria-label="選擇圖示" aria-expanded={picking === link.id} title="選擇圖示" onClick={() => setPicking(picking === link.id ? null : link.id)}><Icon name={link.icon} size={24} /></button>
              <input className="link-input" value={link.label} aria-label="按鈕文字" style={{ color: fg, outlineColor: fg }} onChange={(event) => patch(link.id, { label: event.target.value }, "ll" + link.id)} />
              <MiniBtn label="上移" disabled={index === 0} onClick={() => setLinks((list) => moveById(list, link.id, -1))}>▲</MiniBtn>
              <MiniBtn label="下移" disabled={index === links.length - 1} onClick={() => setLinks((list) => moveById(list, link.id, 1))}>▼</MiniBtn>
              <MiniBtn label="刪除" danger onClick={() => setLinks((list) => list.filter((item) => item.id !== link.id))}>×</MiniBtn>
            </div>
            <div className="ie-row">
              {COLORS.map((color) => (
                <button key={color} type="button" aria-label={`顏色 ${color}`} aria-pressed={link.color === color} className="swatch" style={{ background: color, outline: link.color === color ? "2px solid #000" : "none" }} onClick={() => patch(link.id, { color })} />
              ))}
              <label className="swatch rainbow" title="自訂顏色">
                <input type="color" value={link.color} aria-label="自訂顏色" onChange={(event) => patch(link.id, { color: event.target.value }, "lc" + link.id)} />
              </label>
              <span style={{ width: 6 }} />
              <MiniBtn label="連到網址" className="mini-btn wide" on={link.target === "url"} onClick={() => patch(link.id, { target: "url" })}>網址</MiniBtn>
              <MiniBtn label="連到站內視窗" className="mini-btn wide" on={link.target === "window"} onClick={() => patch(link.id, { target: "window" })}>站內視窗</MiniBtn>
              {link.target === "url"
                ? <input className="ie small grow" value={link.url} placeholder="https://" aria-label="連結網址" onChange={(event) => patch(link.id, { url: event.target.value }, "lu" + link.id)} />
                : (
                  <select className="w98-select tiny" value={link.windowId} aria-label="站內視窗" onChange={(event) => patch(link.id, { windowId: event.target.value })}>
                    <option value="">選擇視窗…</option>
                    {otherWindows.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
                  </select>
                )}
            </div>
            {picking === link.id ? (
              <IconPicker siteId={ctx.siteId} value={link.icon} upload={ctx.upload} onDone={() => setPicking(null)} onChange={(value) => patch(link.id, { icon: value, iconUrl: value.startsWith("http") ? value : "" })} />
            ) : null}
          </div>
        );
      })}
      <button type="button" className="ie-add" onClick={() => setLinks((list) => [...list, makeLink({ label: "新連結", url: "https://" })])}>＋ 新增連結</button>
    </div>
  );
}
