import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { DraftViewer } from "../features/collaboration/DraftViewer";
import { api, type SiteRecord } from "../lib/api";
import { EditorPage } from "./EditorPage";

export function CollaborativeSitePage() {
  const { t: tr } = useTranslation("collab");
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
          throw new Error(tr("collaborativeSite.theServerDidntProvideValid"));
        }
        setSite(next);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : tr("collaborativeSite.failedToLoad")); });
    return () => { active = false; };
  }, [siteId]);

  if (error) return <main className="not-found"><div><h1>{tr("collaborativeSite.cantOpenThisDesktop")}</h1><p>{error}</p></div></main>;
  if (!site) return <div className="boot-screen">Loading desktop...</div>;
  if (site.access_role === "viewer") return <DraftViewer site={site} />;
  return <EditorPage site={site} />;
}
