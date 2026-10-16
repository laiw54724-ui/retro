import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DraftViewer } from "../features/collaboration/DraftViewer";
import { api, type SiteRecord } from "../lib/api";
import { EditorPage } from "./EditorPage";

export function CollaborativeSitePage() {
  const { siteId = "" } = useParams();
  const [site, setSite] = useState<SiteRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setSite(null);
    setError("");
    api.getSite(siteId)
      .then(({ site: next }) => {
        if (!active) return;
        if (next.access_role !== "owner" && next.access_role !== "editor" && next.access_role !== "viewer") {
          throw new Error("伺服器未提供有效的桌面權限，請重新整理後再試。");
        }
        setSite(next);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "載入失敗"); });
    return () => { active = false; };
  }, [siteId]);

  if (error) return <main className="not-found"><div><h1>無法開啟這個桌面</h1><p>{error}</p></div></main>;
  if (!site) return <div className="boot-screen">Loading desktop...</div>;
  if (site.access_role === "viewer") return <DraftViewer site={site} />;
  return <EditorPage site={site} />;
}
