import { useState } from "react";
import { IgEditForm } from "./IgEditForm";
import { IgPreview } from "./IgPreview";
import type { ModuleProps } from "../types";

export function IgView({ window, ctx }: ModuleProps<"instagram">) {
  return <div className="ig-frame" style={{ background: ctx.tv.face }}><div className="ig-frame-inner"><IgPreview window={window} ctx={ctx} /></div></div>;
}

/** In the editor the window has two tabs: the edit form and the interactive preview. */
export function IgInlineEditor(props: ModuleProps<"instagram">) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const tabs: Array<["edit" | "preview", string]> = [["edit", "✎ 編輯內容"], ["preview", "▶ 預覽互動"]];
  return (
    <div className="ig-frame" style={{ background: props.ctx.tv.face }}>
      <div role="tablist" className="w98-tabs ig-modes">
        {tabs.map(([id, label]) => <button key={id} role="tab" type="button" className="w98-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        <span className="ig-mode-hint">{tab === "edit" ? "改完切到「預覽互動」試玩" : "訪客看到的樣子，可以直接點"}</span>
      </div>
      <div role="group" aria-label="Instagram 介面樣式" className="ig-skin-picker">
        <span>介面樣式</span>
        {([['win98', 'Win98'], ['modern', '現代']] as const).map(([skin, label]) => (
          <button key={skin} type="button" className={`mini-btn${props.window.content.skin === skin ? " on" : ""}`} aria-pressed={props.window.content.skin === skin} onClick={() => props.update((window) => ({ ...window, content: { ...window.content, skin } }))}>{label}</button>
        ))}
      </div>
      <div className="ig-frame-inner">{tab === "edit" ? <IgEditForm {...props} /> : <IgPreview window={props.window} ctx={props.ctx} />}</div>
    </div>
  );
}
