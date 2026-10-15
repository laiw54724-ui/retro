import { useEffect, useMemo, useState } from "react";
import { createTemplateDocument, THEME_PRESETS, UsernameSchema, type StarterTemplate } from "@retrodesk/shared";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { RetroButton } from "../components/RetroButton";

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [siteName, setSiteName] = useState("我的小桌面");
  const [themeId, setThemeId] = useState("classic98");
  const [template, setTemplate] = useState<StarterTemplate | "ig">("card");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const validUsername = useMemo(() => UsernameSchema.safeParse(username), [username]);

  useEffect(() => {
    if (!validUsername.success) {
      setAvailable(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api.usernameAvailability(validUsername.data)
        .then((result) => setAvailable(result.available))
        .catch(() => setAvailable(null));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [username, validUsername.success]);

  async function finish() {
    if (!validUsername.success || available === false) return;
    setBusy(true);
    try {
      const document = createTemplateDocument(siteName, themeId, template);
      const { site } = await api.createSite({ username: validUsername.data, siteName, document });
      navigate("/editor/" + site.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell" style={step > 1 ? { background: THEME_PRESETS[themeId].wall } : undefined}>
      <section className="retro-panel onboarding-window">
        <header className="landing-titlebar">設定精靈 — 步驟 {step} / 3</header>
        <div className="onboarding-body">
          <aside>
            <b>Retro Desktop</b>
            <ol>
              <li className={step === 1 ? "current" : ""}>網址與名稱</li>
              <li className={step === 2 ? "current" : ""}>初始主題</li>
              <li className={step === 3 ? "current" : ""}>起始內容</li>
            </ol>
          </aside>
          <div className="onboarding-main">
            {step === 1 ? (
              <>
                <h2>幫你的桌面取個網址</h2>
                <label>
                  個人網址
                  <div className="url-input">
                    <span>retrodesk.me/</span>
                    <input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="your-name" />
                  </div>
                </label>
                <p className={available === false ? "status bad" : "status"}>
                  {!username
                    ? "3–20 個字元，小寫英文、數字或連字號。"
                    : !validUsername.success
                      ? "網址格式不符合規則"
                      : available === false
                        ? "這個網址已有人使用"
                        : available === true
                          ? "這個網址可以使用"
                          : "正在檢查..."}
                </p>
                <label>桌面名稱<input value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h2>選一個初始主題</h2>
                <div className="theme-grid">
                  {Object.values(THEME_PRESETS).map((theme) => (
                    <button type="button" key={theme.id} aria-pressed={themeId === theme.id} className={themeId === theme.id ? "selected" : ""} onClick={() => setThemeId(theme.id)}>
                      <div className="theme-preview" style={{ background: theme.wall }}>
                        <i style={{ background: theme.face }}><b style={{ background: `linear-gradient(90deg,${theme.titleFrom},${theme.titleTo})` }} /></i>
                      </div>
                      <span>{theme.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h2>選一個起始模板</h2>
                <p>模板只建立起始視窗，進入編輯器後都可以自由新增、刪除或修改。</p>
                <div className="template-grid">
                  {([
                    ["blank", "空白", "從一張乾淨桌面開始"],
                    ["card", "電子名片", "關於我 + 社群連結"],
                    ["oc", "OC 展示頁", "角色檔案 + 相簿 + 世界觀"],
                    ["portfolio", "作品集", "自介 + 作品 + 聯絡方式"],
                    ["ig", "復古 IG", "互動個人頁 + 連結"]
                  ] as const).map(([id, name, description]) => (
                    <button type="button" key={id} className={template === id ? "selected" : ""} aria-pressed={template === id} onClick={() => setTemplate(id)}>
                      <strong>{name}</strong><span>{description}</span>
                    </button>
                  ))}
                </div>
                <div className="starter-summary">
                  <strong>{siteName}</strong>
                  <span>/@{username}</span>
                  <span>{THEME_PRESETS[themeId].name}</span>
                </div>
              </>
            ) : null}

            <div className="button-row end">
              <RetroButton disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}>上一步</RetroButton>
              {step < 3 ? (
                <RetroButton className="primary" disabled={step === 1 && (!validUsername.success || available !== true || !siteName.trim())} onClick={() => setStep((current) => current + 1)}>下一步 ›</RetroButton>
              ) : (
                <RetroButton className="primary" disabled={busy} onClick={finish}>{busy ? "建立中..." : "完成，進入編輯器"}</RetroButton>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
