import { useMemo, useState } from "react";
import { createDemoDocument, DEMO_EXAMPLES, DEMO_PREVIEW_IMAGES, type DemoKind } from "@retrodesk/shared";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../app/AuthProvider";
import { RetroButton } from "../components/RetroButton";
import { ExternalLink } from "../components/ExternalLink";
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
        <div className="landing-navigation">
          <nav aria-label={t("landing.navigation")}>
            <a href="#how-it-works">{t("landing.howItWorks")}</a>
            <a href="#examples">{t("landing.examples")}</a>
            <a href="#faq">{t("landing.faqTitle")}</a>
            <a href="#support">{t("landing.help")}</a>
          </nav>
          <LanguageSwitcher />
        </div>
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
            <p className="landing-sign-in-note">{t("landing.signInNote")}</p>
          </div>
          <div className="hero-demo">
            <div className="demo-desktop">
              <div className="desktop-icons-demo" aria-hidden="true"><span>{t("landing.demoCard")}</span><span>{t("landing.demoGallery")}</span><span>{t("landing.demoLinks")}</span></div>
              <div className="demo-win one" aria-hidden="true"><b>{t("landing.demoCard")}.exe</b><div className="demo-card-lines"><img src={DEMO_PREVIEW_IMAGES.card[0]} alt="" decoding="async" referrerPolicy="no-referrer" /><strong>{/* i18n-ignore: fictional sample character name */}Mochi 麻糬</strong><i /><i /></div></div>
              <div className="demo-win two" aria-hidden="true"><b>{t("landing.demoGallery")}</b><div className="demo-grid">{[...DEMO_PREVIEW_IMAGES.ig, ...DEMO_PREVIEW_IMAGES.portfolio].map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />)}</div></div>
              <div className="demo-taskbar"><RetroButton type="button" onClick={() => setDemo("card")}>{t("landing.tryDemo")}</RetroButton></div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="steps-grid" aria-label={t("landing.howItWorks")}>
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
        <h2 className="landing-titlebar">{t("landing.examples")}</h2>
        <p className="landing-section-copy">{t("landing.examplesHelp")}</p>
        <p role="note" className="info-box">{t("landing.fictionalNotice")}</p>
        <div className="example-grid">
          {DEMO_EXAMPLES.map((example) => (
            <button type="button" className="example-card" key={example.kind} onClick={() => setDemo(example.kind)}>
              <div className={`example-thumb example-thumb-${example.kind}`} aria-hidden="true">
                {DEMO_PREVIEW_IMAGES[example.kind].map((src, index) => (
                  <span key={src} className={`example-image example-image-${index}`}><img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /></span>
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
      <section id="faq" className="retro-panel landing-faq" aria-labelledby="faq-title">
        <h2 id="faq-title" className="landing-titlebar">{t("landing.faqTitle")}</h2>
        <div className="landing-faq-list">
          {(["account", "preview", "mobile", "publish", "deletion"] as const).map((question) => (
            <details key={question}>
              <summary>{t(`landing.faq.${question}.question`)}</summary>
              <p>{t(`landing.faq.${question}.answer`)}</p>
            </details>
          ))}
        </div>
      </section>
      <footer id="support" className="retro-panel landing-footer">
        <h2>{t("landing.help")}</h2>
        <nav aria-label={t("landing.resources")}>
          <ExternalLink href="https://github.com/laiw54724-ui/retro/blob/main/PRIVACY.md">{t("landing.privacyDataDeletion")}</ExternalLink>
          <ExternalLink href="https://github.com/laiw54724-ui/retro/issues">{t("landing.supportIssues")}</ExternalLink>
          <ExternalLink href="https://github.com/laiw54724-ui/retro">{t("landing.sourceCode")}</ExternalLink>
          <ExternalLink href="https://github.com/laiw54724-ui/retro/blob/main/LICENSE">{t("landing.sourceLicense")}</ExternalLink>
        </nav>
        <p>{t("landing.publicSupportNote")}</p>
      </footer>
    </main>
  );
}
