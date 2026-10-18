import { useEffect, useMemo, useState } from "react";
import { createLocalizedDocument } from "../i18n/localizedDefaults";
import { themeLabel } from "../i18n/themeNames";
import { useTranslation } from "react-i18next";
import { createTemplateDocument, THEME_PRESETS, UsernameSchema, type StarterTemplate } from "@retrodesk/shared";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { RetroButton } from "../components/RetroButton";

export function OnboardingPage() {
  const { t: tr } = useTranslation("common");
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [siteName, setSiteName] = useState(tr("onboarding.myLittleDesktop"));
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
      const document = createLocalizedDocument(siteName, (name) => createTemplateDocument(name, themeId, template));
      const { site } = await api.createSite({ username: validUsername.data, siteName, document });
      navigate("/editor/" + site.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell" style={step > 1 ? { background: THEME_PRESETS[themeId].wall } : undefined}>
      <section className="retro-panel onboarding-window">
        <header className="landing-titlebar">{tr("onboarding.setupWizardStepOf3", { step })}</header>
        <div className="onboarding-body">
          <aside>
            <b>Retro Desktop</b>
            <ol>
              <li className={step === 1 ? "current" : ""}>{tr("onboarding.urlAndName")}</li>
              <li className={step === 2 ? "current" : ""}>{tr("onboarding.startingTheme")}</li>
              <li className={step === 3 ? "current" : ""}>{tr("onboarding.startingContent")}</li>
            </ol>
          </aside>
          <div className="onboarding-main">
            {step === 1 ? (
              <>
                <h2>{tr("onboarding.pickAUrlForYour")}</h2>
                <label>
                  {tr("onboarding.yourUrl")}
                  <div className="url-input">
                    <span>retrodesk.me/</span>
                    <input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="your-name" />
                  </div>
                </label>
                <p className={available === false ? "status bad" : "status"}>
                  {!username
                    ? tr("onboarding.n320CharactersLowercaseLetters")
                    : !validUsername.success
                      ? tr("onboarding.theUrlFormatIsntAllowed")
                      : available === false
                        ? tr("onboarding.thisUrlIsAlreadyTaken")
                        : available === true
                          ? tr("onboarding.thisUrlIsAvailable")
                          : tr("onboarding.checking")}
                </p>
                <label>{tr("onboarding.desktopName")}<input value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h2>{tr("onboarding.chooseAStartingTheme")}</h2>
                <div className="theme-grid">
                  {Object.values(THEME_PRESETS).map((theme) => (
                    <button type="button" key={theme.id} aria-pressed={themeId === theme.id} className={themeId === theme.id ? "selected" : ""} onClick={() => setThemeId(theme.id)}>
                      <div className="theme-preview" style={{ background: theme.wall }}>
                        <i style={{ background: theme.face }}><b style={{ background: `linear-gradient(90deg,${theme.titleFrom},${theme.titleTo})` }} /></i>
                      </div>
                      <span>{themeLabel(theme)}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h2>{tr("onboarding.chooseAStartingTemplate")}</h2>
                <p>{tr("onboarding.aTemplateOnlyCreatesThe")}</p>
                <div className="template-grid">
                  {([
                    ["blank", tr("onboarding.blank"), tr("onboarding.startFromACleanDesktop")],
                    ["card", tr("onboarding.digitalCard"), tr("onboarding.aboutMeSocialLinks")],
                    ["oc", tr("onboarding.ocShowcase"), tr("onboarding.characterProfileGalleryWorldBuilding")],
                    ["portfolio", tr("onboarding.portfolio"), tr("onboarding.introWorkContact")],
                    ["ig", tr("onboarding.retroIg"), tr("onboarding.interactiveProfileLinks")]
                  ] as const).map(([id, name, description]) => (
                    <button type="button" key={id} className={template === id ? "selected" : ""} aria-pressed={template === id} onClick={() => setTemplate(id)}>
                      <strong>{name}</strong><span>{description}</span>
                    </button>
                  ))}
                </div>
                <div className="starter-summary">
                  <strong>{siteName}</strong>
                  <span>/@{username}</span>
                  <span>{themeLabel(THEME_PRESETS[themeId])}</span>
                </div>
              </>
            ) : null}

            <div className="button-row end">
              <RetroButton disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}>{tr("onboarding.back")}</RetroButton>
              {step < 3 ? (
                <RetroButton className="primary" disabled={step === 1 && (!validUsername.success || available !== true || !siteName.trim())} onClick={() => setStep((current) => current + 1)}>{tr("onboarding.next")}</RetroButton>
              ) : (
                <RetroButton className="primary" disabled={busy} onClick={finish}>{busy ? tr("onboarding.creating") : tr("onboarding.doneOpenTheEditor")}</RetroButton>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
