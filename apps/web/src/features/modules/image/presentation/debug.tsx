import { useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { THEME_PRESETS, type ImageCrop } from "@retrodesk/shared";
import { WindowChrome } from "../../../../components/window-chrome";
import { AssetSourceProvider } from "../../../../lib/assetSource";
import { supabase } from "../../../../lib/supabase";
import { i18n, initI18n } from "../../../../i18n";
import { ImagePresentation } from "./ImagePresentation";
import type { ImageFit } from "./placement";
import "../../../../styles/global.css";
import "../../../../styles/w98.css";
import styles from "./debug.module.css";

// Only this synthetic fixture substitutes a local session; no credentials or
// document writes are involved. Playwright fulfills protected asset requests.
supabase.auth.getSession = (async () => ({ data: { session: { access_token: "fixture-only" } }, error: null })) as typeof supabase.auth.getSession;

const sources = {
  wide: "/wide.png", tall: "/tall.png", transparent: "/transparent.png",
  webp: "/transparent.webp", pixel: "/pixel.png", gif: "/animated.gif",
  extremeWide: "/extreme-wide.png", extremeTall: "/extreme-tall.png",
  broken: "/broken.png", none: null,
  assetA: "retro-asset:11111111-1111-4111-8111-111111111111",
  assetB: "retro-asset:22222222-2222-4222-8222-222222222222"
} as const;
type SourceKey = keyof typeof sources;

function Fixture() {
  const [sourceKey, setSourceKey] = useState<SourceKey>("wide");
  const [fit, setFit] = useState<ImageFit>("contain");
  const [frame, setFrame] = useState<"none" | "simple">("none");
  const [background, setBackground] = useState<"transparent" | "checker" | { color: string }>("transparent");
  const [pixelated, setPixelated] = useState(false);
  const [interaction, setInteraction] = useState<"content" | "decorative">("content");
  const [mode, setMode] = useState<"visitor" | "editor">("visitor");
  const [alt, setAlt] = useState("Synthetic artwork");
  const [caption, setCaption] = useState("Synthetic image caption");
  const [crop, setCrop] = useState<ImageCrop>({ x: 50, y: 50, zoom: 1 });
  const [underlayClicks, setUnderlayClicks] = useState(0);
  const [selects, setSelects] = useState(0);
  const source = sources[sourceKey];
  const props = { source, alt, caption, fit, frame, background, pixelated, interaction, mode, crop,
    onSelect: () => setSelects((value) => value + 1) };
  const setCropField = (field: keyof ImageCrop, value: number) => setCrop((current) => ({ ...current, [field]: value }));

  return <main className={styles.page}>
    <h1>Image W3a renderer fixture</h1>
    <p className={styles.intro}>Synthetic local images only. This page has no document or upload flow.</p>
    <div className={styles.controls}>
      <label>Source <select id="source" value={sourceKey} onChange={(event) => setSourceKey(event.target.value as SourceKey)}>
        {Object.keys(sources).map((key) => <option key={key} value={key}>{key}</option>)}
      </select></label>
      <label>Fit <select id="fit" value={fit} onChange={(event) => setFit(event.target.value as ImageFit)}>
        <option>contain</option><option>cover</option><option>original</option>
      </select></label>
      <label>Frame <select id="frame" value={frame} onChange={(event) => setFrame(event.target.value as "none" | "simple")}>
        <option>none</option><option>simple</option>
      </select></label>
      <label>Background <select id="background" value={typeof background === "object" ? "color" : background} onChange={(event) => setBackground(event.target.value === "color" ? { color: "#aaccdd" } : event.target.value as "transparent" | "checker")}>
        <option>transparent</option><option>checker</option><option value="color">color</option>
      </select></label>
      <label><input id="pixelated" type="checkbox" checked={pixelated} onChange={(event) => setPixelated(event.target.checked)} /> Pixelated</label>
      <label>Interaction <select id="interaction" value={interaction} onChange={(event) => setInteraction(event.target.value as "content" | "decorative")}><option>content</option><option>decorative</option></select></label>
      <label>Mode <select id="mode" value={mode} onChange={(event) => setMode(event.target.value as "visitor" | "editor")}><option>visitor</option><option>editor</option></select></label>
      <label>Alt <input id="alt" type="text" value={alt} onChange={(event) => setAlt(event.target.value)} /></label>
      <label>Caption <input id="caption" type="text" value={caption} onChange={(event) => setCaption(event.target.value)} /></label>
      <label>X <input id="crop-x" type="number" min="0" max="100" value={crop.x} onChange={(event) => setCropField("x", Number(event.target.value))} /></label>
      <label>Y <input id="crop-y" type="number" min="0" max="100" value={crop.y} onChange={(event) => setCropField("y", Number(event.target.value))} /></label>
      <label>Zoom <input id="crop-zoom" type="number" min="1" max="4" step="0.25" value={crop.zoom} onChange={(event) => setCropField("zoom", Number(event.target.value))} /></label>
    </div>
    <h2>Standalone renderer</h2>
    <div className={styles.sample} id="sample">
      <button id="underlay" type="button" className={styles.underlay} onClick={() => setUnderlayClicks((value) => value + 1)}>Underlying button</button>
      <div className={styles.host} id="renderer"><ImagePresentation {...props} /></div>
    </div>
    <p className={styles.status} id="counts">Underlying clicks: {underlayClicks}; selections: {selects}</p>
    <h2>Existing WindowChrome host (composition only)</h2>
    <div className={styles.windowBox} id="window-preview">
      <WindowChrome title="Image host fixture" theme={THEME_PRESETS.classic98} chrome={{ preset: "classic-98", controls: [] }}
        style={{ width: "100%", height: "100%" }} bodyStyle={{ padding: 0 }}>
        <div className={styles.windowBody}><ImagePresentation {...props} mode="visitor" onSelect={undefined} /></div>
      </WindowChrome>
    </div>
  </main>;
}

void initI18n().then(() => createRoot(document.getElementById("image-w3a-root")!).render(
  <I18nextProvider i18n={i18n}><AssetSourceProvider siteId="synthetic-fixture"><Fixture /></AssetSourceProvider></I18nextProvider>
));
