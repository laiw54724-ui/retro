import { useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { THEME_PRESETS, makeWindow } from "@retrodesk/shared";
import { i18n, initI18n } from "../../../i18n";
import { themeView } from "../../../lib/themeView";
import type { ModuleCtx, WindowOf } from "../types";
import { ImageInlineEditor, ImageView } from "./index";
import "../../../styles/global.css";
import "../../../styles/w98.css";

const initial = makeWindow("image");
if (initial.type !== "image") throw new Error("Image fixture requires the image schema");
initial.content.src = "/wide.png";
initial.content.alt = "Wide synthetic artwork";
initial.content.caption = "Synthetic caption";
const imageInitial: WindowOf<"image"> = initial;

const theme = THEME_PRESETS.classic98;
const base: ModuleCtx = {
  theme, tv: themeView(theme), editing: true, mobile: false,
  windows: [], onLink: () => {}
};

function Fixture() {
  const [window, setWindow] = useState<WindowOf<"image">>(imageInitial);
  const [history, setHistory] = useState<WindowOf<"image">[]>([]);
  const update = (recipe: (current: WindowOf<"image">) => WindowOf<"image">) => {
    setWindow((current) => { setHistory((past) => [...past, current]); return recipe(current); });
  };
  return <main style={{ maxWidth: 900, margin: "auto", padding: 16 }}>
    <h1>Image W3b leaf fixture</h1>
    <p>Disposable local image content. Upload transport and site saves are absent.</p>
    <div id="image-editor" style={{ height: 650, border: "1px solid #555" }}><ImageInlineEditor window={window} ctx={base} update={update} /></div>
    <h2>Visitor reader</h2>
    <div id="image-visitor" style={{ width: 350, height: 240, background: "#f9e48c" }}>
      <ImageView window={window} ctx={{ ...base, editing: false }} update={update} />
    </div>
    <button id="fixture-undo" type="button" onClick={() => {
      const previous = history.at(-1);
      if (previous) { setWindow(previous); setHistory((past) => past.slice(0, -1)); }
    }}>Undo fixture edit</button>
    <pre data-testid="content-state">{JSON.stringify(window.content)}</pre>
  </main>;
}

void initI18n().then(() => createRoot(document.getElementById("image-w3b-root")!).render(
  <I18nextProvider i18n={i18n}><Fixture /></I18nextProvider>
));
