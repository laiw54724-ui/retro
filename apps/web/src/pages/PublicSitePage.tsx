import { useEffect, useState } from "react";
import type { SiteDocument } from "@retrodesk/shared";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { RetroWindow } from "../components/RetroWindow";
import { WindowRenderer } from "../features/site/WindowRenderer";

export function PublicSitePage() {
  const { username = "" } = useParams();
  const [document, setDocument] = useState<SiteDocument | null>(null);
  const [open, setOpen] = useState<string[]>([]);
  const [activeMobile, setActiveMobile] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.publicSite(username)
      .then(({ site }) => {
        setDocument(site.published_document);
        setOpen(site.published_document.windows.filter((window) => window.defaultOpen).map((window) => window.id));
        window.document.title = site.site_name + " — Retro Desktop";
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "找不到網站"));
  }, [username]);

  if (error) return <main className="not-found"><div><h1>找不到這個桌面</h1><p>{error}</p></div></main>;
  if (!document) return <div className="boot-screen">Loading desktop...</div>;

  const theme = document.theme;
  const pattern = theme.pattern === "dots"
    ? `radial-gradient(${theme.patternColor} 1.5px, transparent 1.7px)`
    : theme.pattern === "checker"
      ? `conic-gradient(${theme.patternColor} 25%, transparent 0 50%, ${theme.patternColor} 0 75%, transparent 0)`
      : "none";
  const activeWindow = document.windows.find((window) => window.id === activeMobile) ?? null;

  return (
    <main
      className="visitor-page"
      style={{
        backgroundColor: theme.wall,
        backgroundImage: theme.wallImage ? `url(${theme.wallImage})` : pattern
      }}
    >
      <div className="visitor-desktop">
        {document.windows.map((window) => {
          const layout = window.layout.desktop;
          if (!open.includes(window.id)) {
            return (
              <button key={window.id} className="desktop-file" onClick={() => setOpen((current) => [...current, window.id])}>
                <span className="file-icon" />
                <small>{window.title}</small>
              </button>
            );
          }

          return (
            <div key={window.id} className="visitor-window" style={{ left: layout.x, top: layout.y, width: layout.w, height: layout.h, zIndex: layout.z }}>
              <RetroWindow title={window.title} theme={theme} style={{ height: "100%" }}>
                <WindowRenderer
                  window={window}
                  theme={theme}
                  onOpenWindow={(id) => setOpen((current) => current.includes(id) ? current : [...current, id])}
                />
              </RetroWindow>
            </div>
          );
        })}

        <div className="taskbar visitor-taskbar" style={{ background: theme.taskbar }}>
          <button type="button">開始</button>
          <span>{document.siteName}</span>
        </div>
      </div>

      <div className="visitor-mobile">
        {activeWindow ? (
          <>
            <button className="mobile-back" onClick={() => setActiveMobile(null)}>‹ 桌面</button>
            <RetroWindow title={activeWindow.title} theme={theme}>
              <WindowRenderer window={activeWindow} theme={theme} onOpenWindow={setActiveMobile} />
            </RetroWindow>
          </>
        ) : (
          <div className="mobile-icons" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0, 1fr))` }}>
            {[...document.windows]
              .sort((a, b) => a.layout.mobile.order - b.layout.mobile.order)
              .map((window) => (
                <button key={window.id} onClick={() => setActiveMobile(window.id)}>
                  <span className="file-icon" />
                  <small>{window.title}</small>
                </button>
              ))}
          </div>
        )}
      </div>
    </main>
  );
}
