import { useEffect, useMemo, useRef, useState } from "react";
import { createLocalizedDocument } from "../i18n/localizedDefaults";
import { themeLabel } from "../i18n/themeNames";
import { useTranslation } from "react-i18next";
import { createTemplateDocument, THEME_PRESETS, UsernameSchema, type StarterTemplate } from "@retrodesk/shared";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
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
  const busyRef = useRef(false);
  const [createError, setCreateError] = useState<"username" | "validation" | "auth" | "general" | null>(null);
  const validUsername = useMemo(() => UsernameSchema.safeParse(username), [username]);
  const validSiteName = siteName.trim().length > 0 && siteName.trim().length <= 120;

  useEffect(() => {
    let active = true;
    setAvailable(null);
    if (!validUsername.success) {
      return;
    }
    const timer = window.setTimeout(() => {
      api.usernameAvailability(validUsername.data)
        .then((result) => { if (active) setAvailable(result.available); })
        .catch(() => { if (active) setAvailable(null); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [username, validUsername.success]);

  async function finish() {
    if (busyRef.current || !validUsername.success || available !== true || !validSiteName) return;
    busyRef.current = true;
    setBusy(true);
    setCreateError(null);
    try {
      const document = createLocalizedDocument(siteName, (name) => createTemplateDocument(name, themeId, template));
      const { site } = await api.createSite({ username: validUsername.data, siteName, document });
      navigate("/editor/" + site.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === "username_taken") {
        setAvailable(false);
        setCreateError("username");
      } else if (error instanceof ApiError && error.status === 400) {
        setCreateError("validation");
      } else {
        setCreateError(error instanceof ApiError && error.status === 401 ? "auth" : "general");
      }
    } finally {
      busyRef.current = false;
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
                    <input value={username} onChange={(event) => {
                      setUsername(event.target.value.toLowerCase().replace(/\s+/g, "-"));
                      setAvailable(null);
                      setCreateError(null);
                    }} placeholder="your-name" />
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
                <label>{tr("onboarding.desktopName")}<input value={siteName} maxLength={120} onChange={(event) => { setSiteName(event.target.value); setCreateError(null); }} /></label>
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
                    <button type="button" key={id} className={template === id ? "selected" : ""} aria-pressed={template === id} disabled={busy} onClick={() => setTemplate(id)}>
                      <strong>{name}</strong><span>{description}</span>
                    </button>
                  ))}
                </div>
                <div className="starter-summary">
                  <strong>{siteName}</strong>
                  <span>/@{username}</span>
                  <span>{themeLabel(THEME_PRESETS[themeId])}</span>
                </div>
                {createError ? <div className="status bad" role="alert">
                  <p>{tr(`onboarding.createError.${createError}`)}</p>
                  {createError === "username" ? <RetroButton onClick={() => setStep(1)}>{tr("onboarding.changeUrl")}</RetroButton> : null}
                  {createError === "validation" ? <RetroButton onClick={() => { setCreateError(null); setStep(1); }}>{tr("onboarding.reviewDetails")}</RetroButton> : null}
                  {createError === "auth" ? <RetroButton onClick={() => navigate("/auth")}>{tr("onboarding.signInAgain")}</RetroButton> : null}
                </div> : null}
              </>
            ) : null}

            <div className="button-row end">
              <RetroButton disabled={busy || step === 1} onClick={() => { if (!busyRef.current) setStep((current) => Math.max(1, current - 1)); }}>{tr("onboarding.back")}</RetroButton>
              {step < 3 ? (
                <RetroButton className="primary" disabled={step === 1 && (!validUsername.success || available !== true || !validSiteName)} onClick={() => setStep((current) => current + 1)}>{tr("onboarding.next")}</RetroButton>
              ) : (
                <RetroButton className="primary" disabled={busy || available !== true || createError === "auth" || createError === "validation"} onClick={finish}>
                  {busy ? tr("onboarding.creating") : createError === "general" ? tr("onboarding.retryCreation") : tr("onboarding.doneOpenTheEditor")}
                </RetroButton>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
