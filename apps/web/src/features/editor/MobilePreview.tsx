import { useState } from "react";
import type { SiteDocument } from "@retrodesk/shared";
import { RetroWindow } from "../../components/RetroWindow";
import { WindowRenderer } from "../site/WindowRenderer";

export function MobilePreview({ document }: { document: SiteDocument }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = document.windows.find((window) => window.id === openId) ?? null;

  return (
    <div className="phone-frame">
      <div className="phone-status">16:34 <span>5G</span></div>
      <div className="mobile-desktop" style={{ background: document.theme.wall }}>
        {selected ? (
          <>
            <button className="mobile-back" onClick={() => setOpenId(null)}>‹ 桌面</button>
            <RetroWindow title={selected.title} theme={document.theme}>
              <WindowRenderer window={selected} theme={document.theme} onOpenWindow={setOpenId} />
            </RetroWindow>
          </>
        ) : (
          <div className="mobile-icons" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0, 1fr))` }}>
            {[...document.windows].sort((a, b) => a.layout.mobile.order - b.layout.mobile.order).map((window) => (
              <button key={window.id} type="button" onClick={() => setOpenId(window.id)}>
                <span className="file-icon" />
                <small>{window.title}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mobile-toolbar"><span>新增</span><span>編輯</span><span>主題</span><span>預覽</span></div>
    </div>
  );
}
