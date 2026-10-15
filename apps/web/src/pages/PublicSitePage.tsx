import { useEffect, useState } from "react";
import type { SiteDocument } from "@retrodesk/shared";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { RetroWindow } from "../components/RetroWindow";
import { WindowRenderer } from "../features/site/WindowRenderer";
import { VisitorDesktop } from "../features/site/VisitorDesktop";

export function PublicSitePage() {
  const { username = "" } = useParams();
  const [document, setDocument] = useState<SiteDocument | null>(null);
  const [activeMobile, setActiveMobile] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.publicSite(username)
      .then(({ site }) => {
        setDocument(site.published_document);
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
      <VisitorDesktop document={document} />

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
