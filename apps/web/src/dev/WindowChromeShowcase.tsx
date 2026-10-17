import { StrictMode, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { makeIgPost, makeWindow, THEME_PRESETS, type WindowChromePreset, type WindowChromeSection } from "@retrodesk/shared";
import {
  WindowChrome, WindowChromeButton, WindowChromeSlot, WindowFooterActions,
  WindowMenuBar, WindowSeparator, WindowStatusBar, WindowStatusField, WindowSunkenPanel, WindowToolbar
} from "../components/window-chrome";
import { WindowRenderer } from "../features/site/WindowRenderer";
import "../styles/global.css";
import "../styles/w98.css";
import "../styles/ig.css";
import styles from "./WindowChromeShowcase.module.css";

// Development fixtures only. None of these examples registers a new module or
// persists a document. All SVG art in this file was drawn for this showcase.
const theme = THEME_PRESETS.classic98;
const presets: readonly WindowChromePreset[] = ["classic-95", "classic-98", "compact-98"];
const sectionLabels: Record<WindowChromeSection, string> = {
  menuBar: "Show menu bar", toolbar: "Show toolbar", statusBar: "Show status bar", footerActions: "Show footer actions"
};
type FixtureId = "error" | "recorder" | "paint" | "help" | "instagram";
type Settings = { preset: WindowChromePreset; active: boolean; interactive: boolean; sections: Record<WindowChromeSection, boolean> };

function FixtureIcon({ kind }: { kind: FixtureId }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" shapeRendering="crispEdges" aria-hidden="true">
      {kind === "error" ? <><path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="#b50000" stroke="#fff" /><path d="m5 5 6 6m0-6-6 6" stroke="#fff" strokeWidth="2" /></> : null}
      {kind === "recorder" ? <><rect x="5" y="1" width="6" height="9" fill="#dfdfdf" stroke="#111" /><path d="M6 3h4M6 5h4M6 7h4M3 7v4h10V7M8 11v4M5 15h6" stroke="#111" /><path d="M6 2h1v7H6" fill="#fff" /></> : null}
      {kind === "paint" ? <><path d="M1 2h14v12H1z" fill="#fff" stroke="#111" /><path d="M2 10h12v3H2z" fill="#008080" /><path d="M8 3 4 7l2 2 4-4z" fill="#ffff00" stroke="#111" /><path d="m4 7-2 4 4-2" fill="#000080" /></> : null}
      {kind === "help" ? <><path d="M2 1h11v14H2z" fill="#ffffc0" stroke="#111" /><path d="M4 1v14M6 5c0-3 5-3 5 0 0 2-3 1-3 4M8 11v1" stroke="#000080" /></> : null}
      {kind === "instagram" ? <><path d="M1 4h14v10H1zM4 2h4v2H4z" fill="#c0c0c0" stroke="#111" /><path d="M2 5h12v3H2z" fill="#008080" /><circle cx="8" cy="9" r="3" fill="#fff" stroke="#111" /><circle cx="8" cy="9" r="1" fill="#000080" /><path d="M12 5h2v2h-2z" fill="#ffff00" /></> : null}
    </svg>
  );
}

function FixtureFrame({ id, title, caption, height, settings, children, plainBody = false }: {
  id: FixtureId; title: string; caption: string; height: number; settings: Settings; children: ReactNode; plainBody?: boolean;
}) {
  const [visibility, setVisibility] = useState<"open" | "minimized" | "closed">("open");
  const [maximized, setMaximized] = useState(false);
  return (
    <article className={`${styles.fixture} ${maximized ? styles.maximized : ""}`}>
      <div className={styles.fixtureLabel}><h2>{title}</h2><span>{id === "instagram" ? "existing app" : "shell fixture"}</span></div>
      <p className={styles.caption}>{caption}</p>
      {visibility !== "open" ? <div className={styles.reopen}>
        <p>{title} is {visibility}. Its demo state stays in memory.</p>
        <button type="button" onClick={() => setVisibility("open")}>Restore {title}</button>
      </div> : null}
      <div data-testid={`fixture-${id}`} className={styles.windowMount} hidden={visibility !== "open"}>
        <WindowChrome
          title={title}
          theme={theme}
          icon={<FixtureIcon kind={id} />}
          active={settings.active}
          interactiveControls={settings.interactive}
          maximized={maximized}
          chrome={{ preset: settings.preset, sections: settings.sections, controls: id === "error" || id === "help" ? ["close"] : ["minimize", "maximize", "close"] }}
          style={{ width: "100%", height: maximized ? Math.max(height, 440) : height }}
          bodyStyle={plainBody ? { background: "var(--wc-face)", boxShadow: "none", padding: 0 } : undefined}
          onMinimize={() => setVisibility("minimized")}
          onMaximize={() => setMaximized((value) => !value)}
          onClose={() => setVisibility("closed")}
        >{children}</WindowChrome>
      </div>
    </article>
  );
}

function ErrorFixture() {
  const [acknowledged, setAcknowledged] = useState(false);
  return <>
    <div className={styles.errorContent}>
      <svg className={styles.errorIcon} width="36" height="36" viewBox="0 0 36 36" shapeRendering="crispEdges" role="img" aria-label="Error">
        <path d="M11 2h14l9 9v14l-9 9H11l-9-9V11z" fill="#800000" />
        <path d="M10 1h14l9 9v14l-9 9H10l-9-9V10z" fill="#d00000" stroke="#fff" />
        <path d="m11 10 13 13m0-13L11 23" stroke="#fff" strokeWidth="4" />
      </svg>
      <div><p>This sample could not be opened.</p><p>Choose OK to acknowledge this local fixture.</p><small data-testid="error-message">{acknowledged ? "Acknowledged. No file was changed." : "DEMO_ONLY · No file was changed."}</small></div>
    </div>
    <WindowChromeSlot name="footerActions"><WindowFooterActions>
      <WindowChromeButton isDefault onClick={() => setAcknowledged(true)}>OK</WindowChromeButton>
    </WindowFooterActions></WindowChromeSlot>
  </>;
}

function RecorderFixture() {
  const [sample, setSample] = useState<"tone" | "silence">("tone");
  return <>
    <WindowChromeSlot name="menuBar"><WindowMenuBar menus={[
      { id: "file", label: "File", items: [{ id: "reset", label: "Reset sample", onSelect: () => setSample("tone") }, { id: "save", label: "Save recording…", disabled: true, shortcut: "Ctrl+S" }] },
      { id: "edit", label: "Edit", items: [{ id: "silence", label: "Show silence sample", onSelect: () => setSample("silence") }] },
      { id: "effects", label: "Effects", items: [{ id: "speed", label: "Increase speed", disabled: true }, { id: "echo", label: "Add echo", disabled: true }] }
    ]} /></WindowChromeSlot>
    <div className={styles.recorderBody}>
      <WindowSunkenPanel><div className={styles.waveform}>
        <svg viewBox="0 0 360 72" width="100%" height="72" role="img" aria-label={`${sample === "tone" ? "Illustrative tone" : "Silence"} waveform`} shapeRendering="crispEdges">
          <path d="M0 36h360" stroke="#005700" />
          <path d={sample === "silence" ? "M0 36h360" : "M0 36h24l6-4 6 10 6-13 6 17 6-28 6 36 6-24 6 10 6-4h24l6-10 6 21 6-34 6 47 6-55 6 58 6-52 6 42 6-32 6 21 6-6h24l6-5 6 12 6-27 6 38 6-46 6 52 6-39 6 26 6-15 6 7h42"} fill="none" stroke="#00ff00" strokeWidth="1.5" />
        </svg>
      </div></WindowSunkenPanel>
      <div className={styles.recordReadouts}><span>Position: <strong>0.00 sec</strong></span><span>Length: <strong>1.00 sec</strong></span></div>
      <div className={styles.recordTrack}><span /></div>
      <WindowToolbar label="Recorder controls">
        <WindowChromeButton disabled aria-label="Rewind (shell only)"><span className={styles.transport}>◀◀</span></WindowChromeButton>
        <WindowChromeButton disabled aria-label="Fast forward (shell only)"><span className={styles.transport}>▶▶</span></WindowChromeButton>
        <WindowChromeButton disabled aria-label="Play (shell only)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 1v12l11-6z" fill="currentColor" /></svg></WindowChromeButton>
        <WindowChromeButton disabled aria-label="Stop (shell only)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2h10v10H2z" fill="currentColor" /></svg></WindowChromeButton>
        <WindowChromeButton disabled aria-label="Record (shell only)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="#a02020" /></svg></WindowChromeButton>
      </WindowToolbar>
    </div>
    <WindowChromeSlot name="statusBar"><WindowStatusBar><WindowStatusField>PCM · 22 kHz · 8 bit · mono</WindowStatusField><WindowStatusField>Illustration only</WindowStatusField></WindowStatusBar></WindowChromeSlot>
  </>;
}

const swatches = [{ label: "Blue", color: "#000080" }, { label: "Teal", color: "#008080" }, { label: "Red", color: "#800000" }, { label: "Purple", color: "#800080" }];
function PaintFixture() {
  const [color, setColor] = useState(swatches[0].color);
  const [note, setNote] = useState("Select a sample color");
  const reset = () => { setColor(swatches[0].color); setNote("Preview reset"); };
  return <>
    <WindowChromeSlot name="menuBar"><WindowMenuBar menus={[
      { id: "file", label: "File", items: [{ id: "reset", label: "Reset sample", onSelect: reset, shortcut: "Ctrl+R" }, { id: "save", label: "Save bitmap…", disabled: true, shortcut: "Ctrl+S" }, { id: "separator", separator: true }, { id: "about", label: "About this fixture", onSelect: () => setNote("Self-authored sample; no drawing engine") }] },
      { id: "edit", label: "Edit", items: [{ id: "reset", label: "Reset sample", onSelect: reset }, { id: "paste", label: "Paste", disabled: true }] },
      { id: "view", label: "View", items: swatches.map((swatch) => ({ id: swatch.label, label: `${swatch.label} sample`, checked: color === swatch.color, onSelect: () => { setColor(swatch.color); setNote(`${swatch.label} sample selected`); } })) },
      { id: "image", label: "Image", items: [{ id: "attributes", label: "Attributes…", disabled: true }] }
    ]} /></WindowChromeSlot>
    <WindowChromeSlot name="toolbar"><WindowToolbar label="Paint sample controls">
      <WindowChromeButton disabled aria-label="Pencil (shell only)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 10 8-8 3 3-8 8-4 1z" fill="#ffff80" stroke="currentColor" /><path d="m3 10 3 3m3-9 3 3" stroke="currentColor" /></svg></WindowChromeButton>
      <WindowChromeButton disabled aria-label="Eraser (shell only)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m2 10 7-7 5 5-5 6H6z" fill="#ffb0b0" stroke="currentColor" /><path d="m5 7 6 5" stroke="currentColor" /></svg></WindowChromeButton>
      <WindowSeparator orientation="vertical" />
      {swatches.map((swatch) => <WindowChromeButton key={swatch.label} aria-label={`${swatch.label} sample`} pressed={color === swatch.color} onClick={() => { setColor(swatch.color); setNote(`${swatch.label} sample selected`); }}><span className={styles.swatch} style={{ background: swatch.color }} /></WindowChromeButton>)}
    </WindowToolbar></WindowChromeSlot>
    <div className={styles.paintWorkspace}>
      <svg className={styles.paintImage} viewBox="0 0 320 176" role="img" aria-label="Self-authored pixel landscape: a tiny house under a blue sky" shapeRendering="crispEdges">
        <path d="M0 0h320v176H0z" fill="#c9e9ed" /><path d="M0 122h320v54H0z" fill="#80b580" />
        <path d="M0 120h28v-12h25v-12h42v15h18v11h41v-18h32v-17h35v17h36v17h63v23H0z" fill="#3c877c" />
        <path d="M32 30h10V20h27v10h12v11H32zM212 42h14V29h37v13h12v10h-63z" fill="#fff" />
        <path d="M268 14h20v20h-20z" fill="#ffff80" />
        <path d="M116 95h92v65h-92z" fill="#ffffc0" stroke="#111" strokeWidth="2" />
        <path d="m104 96 58-44 58 44z" fill={color} stroke="#111" strokeWidth="2" />
        <path d="M127 110h20v22h-20zM177 110h20v22h-20z" fill="#c9e9ed" stroke="#111" strokeWidth="2" />
        <path d="M155 126h16v34h-16z" fill="#a47858" stroke="#111" strokeWidth="2" /><path d="M159 143h2v2h-2z" fill="#111" />
        <path d="M48 154h8v-12h8v12h8v8H48zM246 158h8v-12h8v12h8v8h-24z" fill="#ffff80" />
        <path d="M149 161h27l14 15h-55z" fill="#d9c5a9" />
      </svg>
    </div>
    <WindowChromeSlot name="statusBar"><WindowStatusBar><WindowStatusField><span data-testid="paint-status">{note}</span></WindowStatusField><WindowStatusField>320 × 176 px</WindowStatusField></WindowStatusBar></WindowChromeSlot>
  </>;
}

const helpTabs = ["Contents", "Index", "Find"] as const;
type HelpTab = typeof helpTabs[number];
const topics = [
  { title: "Window controls", text: "Minimize, maximize and close are callbacks owned by the surrounding window manager." },
  { title: "Keyboard menus", text: "Open a menu with Enter or Arrow Down. Move with the arrow keys; Escape returns to the menu button." },
  { title: "Preserving your work", text: "Changing the preset or hiding a chrome slot keeps the application and its draft mounted." }
];
function HelpFixture() {
  const [tab, setTab] = useState<HelpTab>("Contents");
  const [topicIndex, setTopicIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("Keep this draft while changing the frame");
  const [count, setCount] = useState(0);
  const topic = topics[topicIndex];
  return <>
    <WindowChromeSlot name="toolbar"><WindowToolbar label="State preservation demo">
      <WindowChromeButton onClick={() => setCount((value) => value + 1)}>Increment demo counter</WindowChromeButton>
      <output aria-label="Demo counter" data-testid="state-counter">{count}</output>
    </WindowToolbar></WindowChromeSlot>
    <div className={styles.helpBody}>
      <div role="tablist" aria-label="Help navigation" className={styles.helpTabs}>
        {helpTabs.map((label, index) => <button key={label} type="button" id={`help-tab-${label}`} role="tab" aria-controls={`help-panel-${label}`} aria-selected={tab === label} tabIndex={tab === label ? 0 : -1} onClick={() => setTab(label)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % helpTabs.length : event.key === "ArrowLeft" ? (index + helpTabs.length - 1) % helpTabs.length : event.key === "Home" ? 0 : event.key === "End" ? helpTabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          setTab(helpTabs[next]);
          document.getElementById(`help-tab-${helpTabs[next]}`)?.focus();
        }}>{label}</button>)}
      </div>
      <div className={styles.helpPanel} role="tabpanel" id={`help-panel-${tab}`} aria-labelledby={`help-tab-${tab}`}>
        {tab === "Contents" ? <div className={styles.helpColumns}><nav aria-label="Help topics">{topics.map((item, index) => <button key={item.title} type="button" aria-current={topicIndex === index ? "page" : undefined} onClick={() => setTopicIndex(index)}>{item.title}</button>)}</nav><div><strong>{topic.title}</strong><p>{topic.text}</p></div></div> : null}
        {tab === "Index" ? <div className={styles.helpIndex}><strong>Index</strong><p>Application → content area</p><p>Chrome → reusable window frame</p><p>Slot → app-owned controls in the frame</p></div> : null}
        {tab === "Find" ? <div className={styles.helpFind}><label>Find a help topic<input value={query} onChange={(event) => setQuery(event.target.value)} /></label><ul>{topics.filter((item) => `${item.title} ${item.text}`.toLowerCase().includes(query.toLowerCase())).map((item) => <li key={item.title}>{item.title}</li>)}</ul></div> : null}
      </div>
      <label className={styles.draftLabel}>State preservation draft<input data-testid="state-draft" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
    </div>
    <WindowChromeSlot name="statusBar"><WindowStatusBar><WindowStatusField>Local help · {tab}</WindowStatusField><WindowStatusField>Counter: {count}</WindowStatusField></WindowStatusBar></WindowChromeSlot>
    <WindowChromeSlot name="footerActions"><WindowFooterActions><WindowChromeButton disabled>Print…</WindowChromeButton><WindowChromeButton isDefault onClick={() => { setDraft("Keep this draft while changing the frame"); setCount(0); }}>Reset demo</WindowChromeButton></WindowFooterActions></WindowChromeSlot>
  </>;
}

function makeInstagramFixture() {
  const win = makeWindow("instagram");
  if (win.type !== "instagram") throw new Error("Expected an Instagram fixture");
  return {
    ...win, id: "chrome-fixture-instagram", title: "Instagram.exe",
    content: {
      ...win.content,
      profile: {
        ...win.content.profile, username: "sample_archive", name: "Fictional sample archive",
        bio: "Local fixture for the existing Instagram module.\nNo real account or user content.",
        followers: "0", following: "0", showCounts: false, showHighlights: false, showFollowedBy: false,
        showLikes: false, allowLikes: false, allowComments: false
      },
      images: [
        makeIgPost({ id: "sample-one", title: "Sample one", caption: "First local placeholder", date: "Fixture", likes: 0 }),
        makeIgPost({ id: "sample-two", title: "Sample two", caption: "Second local placeholder", date: "Fixture", likes: 0 }),
        makeIgPost({ id: "sample-three", title: "Sample three", caption: "Third local placeholder", date: "Fixture", likes: 0 })
      ]
    }
  };
}
const instagramWindow = makeInstagramFixture();

function InstagramFixture() {
  return <>
    <WindowRenderer window={instagramWindow} theme={theme} />
    <WindowChromeSlot name="statusBar"><WindowStatusBar><WindowStatusField>Existing Instagram module · local sample</WindowStatusField></WindowStatusBar></WindowChromeSlot>
  </>;
}

/** A small, inspectable consumer for host/App handoff and minimum-size keyboard behavior. */
function ChromeContractFixture() {
  const [producer, setProducer] = useState("app");
  const [draft, setDraft] = useState("Keep this short-window draft");
  const [toolbarText, setToolbarText] = useState("abc");
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [visible, setVisible] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const status = (text: string) => <WindowStatusBar><WindowStatusField>{text}</WindowStatusField></WindowStatusBar>;
  return <details className={styles.contract}>
    <summary>API contract and minimum-size example</summary>
    <label>Status producer<select aria-label="Status producer" value={producer} onChange={(event) => setProducer(event.target.value)}><option value="app">App portal</option><option value="direct">Direct host slot</option><option value="fallback">Host fallback</option></select></label>
    <label><input type="checkbox" checked={toolbarVisible} onChange={(event) => setToolbarVisible(event.target.checked)} />Contract toolbar visible</label>
    {!visible ? <button type="button" onClick={() => setVisible(true)}>Restore contract example</button> : null}
    <div hidden={!visible}>
    <WindowChrome title="A deliberately long title for a 220 pixel window" theme={theme}
      chrome={{ sections: { toolbar: toolbarVisible } }} interactiveControls maximized={maximized}
      onMinimize={() => setVisible(false)} onMaximize={() => setMaximized((value) => !value)} onClose={() => setVisible(false)}
      frameProps={{ "aria-label": "Chrome contract example" }}
      style={{ width: maximized ? 300 : 220, height: maximized ? 320 : 140 }}
      slots={producer === "direct" ? { statusBar: status("Direct host status") } : undefined}
      fallbackSlots={{ statusBar: status("Host fallback status") }}>
      <WindowChromeSlot name="menuBar"><WindowMenuBar label="Contract menu" menus={[{ id: "file", label: "File", items: [
        { id: "reset", label: "Reset draft", onSelect: () => setDraft("Reset by menu") },
        { id: "disabled", label: "Unavailable command", disabled: true }
      ] }]} /></WindowChromeSlot>
      <WindowChromeSlot name="toolbar"><WindowToolbar label="Contract toolbar">
        <WindowChromeButton onClick={() => setToolbarText("Previous")}>Previous</WindowChromeButton>
        <WindowChromeButton disabled>Unavailable</WindowChromeButton>
        <WindowChromeButton onClick={() => setToolbarText("Next")}>Next</WindowChromeButton>
        <input aria-label="Toolbar text" style={{ width: 90, minWidth: 0 }} value={toolbarText} onChange={(event) => setToolbarText(event.target.value)} />
      </WindowToolbar></WindowChromeSlot>
      <label className={styles.draftLabel}>Contract draft<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
      {producer === "app" ? <WindowChromeSlot name="statusBar">{status("App portal status")}</WindowChromeSlot> : null}
      <WindowChromeSlot name="footerActions"><WindowFooterActions><WindowChromeButton onClick={() => setDraft("Reset by footer")}>Reset contract draft</WindowChromeButton></WindowFooterActions></WindowChromeSlot>
    </WindowChrome>
    </div>
  </details>;
}

export function WindowChromeShowcase() {
  const [preset, setPreset] = useState<WindowChromePreset>("classic-98");
  const [active, setActive] = useState(true);
  const [interactive, setInteractive] = useState(true);
  const [width, setWidth] = useState("full");
  const [sections, setSections] = useState<Record<WindowChromeSection, boolean>>({ menuBar: true, toolbar: true, statusBar: true, footerActions: true });
  const settings = { preset, active, interactive, sections };
  return <main className={styles.page}>
    <header className={styles.header}><p className={styles.eyebrow}>RETRO / WINDOW CHROME / ISSUE #49</p><h1>One frame. Five familiar windows.</h1><p>Development fixtures for Windows 95 / 98 chrome. Error, recorder, Paint and Help are shell examples; audio and drawing engines are not included. Instagram uses the existing app with fictional local data.</p></header>
    <form className={styles.settings} aria-label="Chrome showcase settings" onSubmit={(event) => event.preventDefault()}>
      <label>Chrome preset<select aria-label="Chrome preset" value={preset} onChange={(event) => setPreset(event.target.value as WindowChromePreset)}>{presets.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Preview width<select aria-label="Preview width" value={width} onChange={(event) => setWidth(event.target.value)}><option value="full">Full (440 px)</option><option value="320">Narrow (320 px)</option><option value="375">Narrow (375 px)</option><option value="430">Narrow (430 px)</option></select></label>
      <label className={styles.check}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Active windows</label>
      <label className={styles.check}><input type="checkbox" checked={interactive} onChange={(event) => setInteractive(event.target.checked)} />Interactive window controls</label>
      <fieldset><legend>Chrome slots</legend>{(Object.keys(sectionLabels) as WindowChromeSection[]).map((section) => <label key={section} className={styles.check}><input type="checkbox" checked={sections[section]} onChange={(event) => setSections((value) => ({ ...value, [section]: event.target.checked }))} />{sectionLabels[section]}</label>)}</fieldset>
    </form>
    <p className={styles.hint}>Try the Help counter and draft, then switch presets or hide its toolbar. The same application state and input element remain mounted. Window controls only affect these local fixtures.</p>
    <div className={styles.stage} data-testid="chrome-stage" style={{ "--fixture-width": width === "full" ? "440px" : `${width}px` } as CSSProperties}>
      <FixtureFrame id="error" title="Application Error" caption="Message area, default action and close-only titlebar." height={204} settings={settings} plainBody><ErrorFixture /></FixtureFrame>
      <FixtureFrame id="recorder" title="Sound Recorder" caption="Menu, waveform, disabled transport and segmented status." height={282} settings={settings} plainBody><RecorderFixture /></FixtureFrame>
      <FixtureFrame id="paint" title="untitled - Paint" caption="Keyboard menus and a sample color palette; self-authored art." height={350} settings={settings}><PaintFixture /></FixtureFrame>
      <FixtureFrame id="help" title="Help Topics" caption="Working local tabs, app-owned slots and persistent input." height={402} settings={settings} plainBody><HelpFixture /></FixtureFrame>
      <FixtureFrame id="instagram" title="Instagram.exe" caption="Existing navigation and post views inside the shared frame." height={510} settings={settings}><InstagramFixture /></FixtureFrame>
    </div>
    <ChromeContractFixture />
    <footer className={styles.pageFooter}>Self-authored geometric artwork. No imported Windows bitmaps, remote images, API calls or production routes.</footer>
  </main>;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><WindowChromeShowcase /></StrictMode>);
