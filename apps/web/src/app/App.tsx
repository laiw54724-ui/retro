import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LandingPage } from "../pages/LandingPage";
import { AuthPage } from "../pages/AuthPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { PublicSitePage } from "../pages/PublicSitePage";
import { InvitePage } from "../pages/InvitePage";

function EditorRoute() {
  const { t } = useTranslation(["common", "collab"]);
  const [Editor, setEditor] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    // Resolve the module before rendering it; a Suspense reveal delayed editor readiness.
    import("../pages/CollaborativeSitePage")
      .then(module => { if (active) setEditor(() => module.CollaborativeSitePage); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  if (failed) return (
    <main className="not-found"><div role="alert">
      <h1>{t("collaborativeSite.cantOpenThisDesktop", { ns: "collab" })}</h1>
      <button type="button" onClick={() => window.location.reload()}>{t("desktopHub.retry")}</button>
    </div></main>
  );
  if (!Editor) return <div className="boot-screen" role="status">{t("app.loadingSite")}</div>;
  return <Editor />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div className="boot-screen" role="status">{t("app.loadingAccount")}</div>;
  if (!user) return <Navigate to={`/auth${location.search}${location.hash}`} replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
      <Route path="/editor/:siteId" element={<RequireAuth><EditorRoute /></RequireAuth>} />
      <Route path="/:handle/oc/:profileId" element={<PublicSitePage />} />
      <Route path="/:handle/post/:postId" element={<PublicSitePage />} />
      <Route path="/:handle" element={<PublicSitePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
