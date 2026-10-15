import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LandingPage } from "../pages/LandingPage";
import { AuthPage } from "../pages/AuthPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { EditorPage } from "../pages/EditorPage";
import { PublicSitePage } from "../pages/PublicSitePage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div className="boot-screen">Loading Retro Desktop...</div>;
  if (!user) return <Navigate to={`/auth${location.search}${location.hash}`} replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
      <Route path="/editor/:siteId" element={<RequireAuth><EditorPage /></RequireAuth>} />
      <Route path="/@:username" element={<PublicSitePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
