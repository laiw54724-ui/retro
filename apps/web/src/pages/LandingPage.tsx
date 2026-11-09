import { useMemo, useState } from "react";
import { createDemoDocument, DEMO_EXAMPLES, DEMO_PREVIEW_IMAGES, type DemoKind } from "@retrodesk/shared";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../app/AuthProvider";
import { RetroButton } from "../components/RetroButton";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { buildSampleModel } from "../features/editor/previewModel";
import { VisitorPreview } from "../features/editor/VisitorPreview";
import { useLocaleFormatting } from "../i18n/format";
import { localizeDefaults } from "../i18n/localizedDefaults";

export function LandingPage() {
  const { t } = useTranslation("common");
  const { fontFamily, locale } = useLocaleFormatting();
  const { user } = useAuth();
  const [demo, setDemo] = useState<DemoKind | null>(null);
  // Sample content follows the UI language it is opened in; it is a throwaway preview, never saved.
  const demoDocument = useMemo(() => demo ? localizeDefaults(createDemoDocument(demo)) : null, [demo, locale]);
  return (
    <main className="landing-shell" style={{ fontFamily }}>
      <section className="landing-window retro-panel">
        <header className="landing-titlebar">{t("landing.title")}</header>
        <div style={{ padding: "12px 16px 0" }}><LanguageSwitcher /></div>
        {user ? <p className="info-box">{t("landing.signedIn", { email: user.email })}</p> : null}
        <div className="landing-hero">
          <div className="landing-copy">
            <span className="eyebrow" style={{ fontFamily }}>{t("landing.eyebrow")}</span>
            <h1 style={{ fontFamily, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{t("landing.headline")}</h1>
            <p>{t("landing.description")}</p>
            <div className="button-row">
              <Link className="retro-link primary" to="/auth">{t(user ? "landing.myDesktop" : "landing.createDesktop")}</Link>
              <a className="retro-link" href="#examples">{t("landing.browseExamples")}</a>
            </div>
            <p role="note" style={{ fontSize: "12px" }}>{t("landing.fictionalNotice")}</p>
          </div>
          <div className="hero-demo">
            <div className="demo-desktop">
              <div className="desktop-icons-demo"><span>{t("landing.demoCard")}</span><span>{t("landing.demoGallery")}</span><span>{t("landing.demoLinks")}</span></div>
              <div className="demo-win one"><b>{t("landing.demoCard")}.exe</b><div className="demo-card-lines"><img src={DEMO_PREVIEW_IMAGES.card[0]} alt="" decoding="async" /><strong>{/* i18n-ignore: fictional sample character name */}Mochi 麻糬</strong><i /><i /></div></div>
              <div className="demo-win two"><b>{t("landing.demoGallery")}</b><div className="demo-grid">{[...DEMO_PREVIEW_IMAGES.ig, ...DEMO_PREVIEW_IMAGES.portfolio].map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" />)}</div></div>
              <div className="demo-taskbar"><RetroButton>{t("desktop.start")}</RetroButton></div>
            </div>
          </div>
        </div>
      </section>

      <section className="steps-grid">
        {([
          ["01", "choose"],
          ["02", "add"],
          ["03", "publish"]
        ] as const).map(([n, step]) => (
          <article className="retro-panel step-card" key={n}>
            <span>{n}</span>
            <div><strong>{t(`landing.steps.${step}.title`)}</strong><p>{t(`landing.steps.${step}.description`)}</p></div>
          </article>
        ))}
      </section>

      <section id="examples" className="retro-panel examples">
        <header className="landing-titlebar">{t("landing.examples")}</header>
        <p role="note" className="info-box">{t("landing.fictionalNotice")}</p>
        <div className="example-grid">
          {DEMO_EXAMPLES.map((example) => (
            <button type="button" className="example-card" key={example.kind} onClick={() => setDemo(example.kind)}>
              <div className={`example-thumb example-thumb-${example.kind}`} aria-hidden="true">
                {DEMO_PREVIEW_IMAGES[example.kind].map((src, index) => (
                  <span key={src} className={`example-image example-image-${index}`}><img src={src} alt="" loading="lazy" decoding="async" /></span>
                ))}
              </div>
              <strong>{t(`landing.examplesList.${example.kind}.name`)}</strong>
              <p>{t(`landing.examplesList.${example.kind}.description`)}</p>
              <span>{t("landing.openExample")}</span>
            </button>
          ))}
        </div>
      </section>
      {demoDocument ? <VisitorPreview sample={buildSampleModel(demoDocument)} onClose={() => setDemo(null)} /> : null}
      <footer className="retro-panel" style={{ width: "min(1000px, 100%)", padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 16 }}>
        <a href="https://github.com/laiw54724-ui/retro/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer">{t("landing.privacyDataDeletion")}</a>
        <a href="https://github.com/laiw54724-ui/retro/issues" target="_blank" rel="noopener noreferrer">{t("landing.supportIssues")}</a>
      </footer>
    </main>
  );
}
