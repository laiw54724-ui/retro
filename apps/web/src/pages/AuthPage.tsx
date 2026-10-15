import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { RetroButton } from "../components/RetroButton";

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (mode === "login") {
      const result = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (result.error) return setError(result.error.message);
      navigate("/onboarding");
      return;
    }

    const result = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) return setError(result.error.message);
    if (!result.data.session) {
      setMessage("帳號已建立。請先到信箱完成驗證，再回來登入。");
      setMode("login");
      return;
    }
    navigate("/onboarding");
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/onboarding` }
    });
    if (result.error) {
      setBusy(false);
      setError(result.error.message);
    }
  }

  return (
    <main className="auth-shell">
      <form className="retro-panel auth-window" onSubmit={submit}>
        <header className="landing-titlebar">Retro Desktop — {mode === "login" ? "登入" : "註冊"}</header>
        <div className="tab-row">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>登入</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>註冊</button>
        </div>
        <div className="button-row oauth-row">
          <RetroButton type="button" disabled={busy} onClick={signInWithGoogle}>使用 Google 繼續</RetroButton>
        </div>
        <p className="oauth-divider">或使用電子郵件</p>
        <label>電子郵件<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>密碼<input type="password" value={password} minLength={6} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error ? <p className="error-box">{error}</p> : null}
        {message ? <p className="info-box">{message}</p> : null}
        <div className="button-row end">
          <Link className="retro-link" to="/">取消</Link>
          <RetroButton className="primary" disabled={busy}>{busy ? "處理中..." : mode === "login" ? "登入" : "建立帳號"}</RetroButton>
        </div>
        <small>正式版使用 Supabase Auth。</small>
      </form>
    </main>
  );
}
