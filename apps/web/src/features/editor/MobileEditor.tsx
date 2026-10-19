import { useMemo, useState } from "react";
import { themeLabel } from "../../i18n/themeNames";
import { useTranslation } from "react-i18next";
import { THEME_PRESETS, type DesktopWindow, type SiteDocument } from "@retrodesk/shared";
import { RetroButton } from "../../components/RetroButton";
import { RetroWindow } from "../../components/RetroWindow";
import { Icon } from "../../components/Icon";
import { InspectorContent } from "./InspectorContent";
import { WindowRenderer } from "../site/WindowRenderer";
import { creatableModuleDefinitions } from "../modules/registry";

type Mode = "desktop" | "add" | "edit" | "theme" | "preview";

type Props = {
  document: SiteDocument;
  siteId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (type: DesktopWindow["type"]) => void;
  onUpdate: (id: string, recipe: (window: DesktopWindow) => DesktopWindow) => void;
  onDelete: (id: string) => void;
  onTheme: (theme: SiteDocument["theme"]) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onColumns: (columns: 3 | 4) => void;
  onMessage: (message: string) => void;
};

export function MobileEditor({
  document,
  siteId,
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onTheme,
  onReorder,
  onColumns,
  onMessage
}: Props) {
  const { t: tr } = useTranslation("editor");
  const [mode, setMode] = useState<Mode>("desktop");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const selected = useMemo(
    () => document.windows.find((window) => window.id === selectedId) ?? null,
    [document.windows, selectedId]
  );
  const ordered = useMemo(
    () => [...document.windows].sort((a, b) => a.layout.mobile.order - b.layout.mobile.order),
    [document.windows]
  );

  function selectAndEdit(id: string) {
    onSelect(id);
    setMode("edit");
  }

  function add(type: DesktopWindow["type"]) {
    onAdd(type);
    setMode("edit");
  }

  function updateSelected(recipe: (window: DesktopWindow) => DesktopWindow) {
    if (selected) onUpdate(selected.id, recipe);
  }

  const previewWindow = document.windows.find((window) => window.id === previewId) ?? null;

  return (
    <div className="mobile-editor">
      <header className="mobile-editor-header">
        <div>
          <strong>{document.siteName}</strong>
          <small>{mode === "preview" ? tr("mobileEditor.visitorPreview") : tr("mobileEditor.mobileEditMode")}</small>
        </div>
        {mode !== "desktop" ? <button type="button" onClick={() => setMode("desktop")}>{tr("mobileEditor.backToDesktop")}</button> : null}
      </header>

      <div className="mobile-editor-body" style={{ background: document.theme.wall }}>
        {mode === "desktop" ? (
          <section className="mobile-editor-desktop">
            <div className="mobile-layout-row">
              <span>{tr("mobileEditor.iconColumns")}</span>
              <button className={document.mobileColumns === 3 ? "active" : ""} onClick={() => onColumns(3)}>3</button>
              <button className={document.mobileColumns === 4 ? "active" : ""} onClick={() => onColumns(4)}>4</button>
            </div>
            <div className="mobile-icons mobile-edit-icons" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0,1fr))` }}>
              {ordered.map((window) => (
                <button key={window.id} type="button" onClick={() => selectAndEdit(window.id)}>
                  <span className="file-icon" />
                  <small>{window.title}</small>
                </button>
              ))}
            </div>
            {document.windows.length === 0 ? <div className="mobile-empty">{tr("mobileEditor.noWindowsYetStartWith")}</div> : null}
          </section>
        ) : null}

        {mode === "add" ? (
          <section className="mobile-sheet">
            <h2>{tr("mobileEditor.addAWindow")}</h2>
            <p>{tr("mobileEditor.windowsArentDraggedOnMobile")}</p>
            <div className="mobile-module-list">
              {creatableModuleDefinitions.map((module) => (
                <button key={module.type} type="button" onClick={() => add(module.type)}>
                  <Icon name={module.mobile.icon} size={32} className="module-icon" />
                  <span><strong>{module.label}</strong><small>{module.description}</small></span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {mode === "edit" ? (
          <section className="mobile-sheet mobile-inspector">
            {selected ? (
              <>
                <div className="mobile-selected-heading">
                  <span className="module-icon" />
                  <div><strong>{selected.title}</strong><small>{tr("mobileEditor.iconPosition", { position: selected.layout.mobile.order + 1 })}</small></div>
                </div>
                <label>{tr("mobileEditor.windowTitle")}<input value={selected.title} onChange={(event) => updateSelected((window) => ({ ...window, title: event.target.value }))} /></label>
                <label>{tr("mobileEditor.desktopIcon")}<input value={selected.icon} onChange={(event) => updateSelected((window) => ({ ...window, icon: event.target.value }))} /></label>
                <label className="check-row"><input type="checkbox" checked={selected.defaultOpen} onChange={(event) => updateSelected((window) => ({ ...window, defaultOpen: event.target.checked }))} />{tr("mobileEditor.openByDefaultWhenVisitors")}</label>
                <div className="mobile-order-row">
                  <span>{tr("mobileEditor.mobileIconOrder")}</span>
                  <RetroButton disabled={selected.layout.mobile.order === 0} onClick={() => onReorder(selected.id, -1)}>{tr("mobileEditor.moveUp")}</RetroButton>
                  <RetroButton disabled={selected.layout.mobile.order === ordered.length - 1} onClick={() => onReorder(selected.id, 1)}>{tr("mobileEditor.moveDown")}</RetroButton>
                </div>
                <InspectorContent
                  window={selected}
                  allWindows={document.windows}
                  siteId={siteId}
                  update={updateSelected}
                  onMessage={onMessage}
                />
                <RetroButton className="danger mobile-delete" onClick={() => { onDelete(selected.id); setMode("desktop"); }}>{tr("mobileEditor.deleteWindow")}</RetroButton>
              </>
            ) : (
              <div className="mobile-empty">
                <strong>{tr("mobileEditor.noWindowSelected")}</strong>
                <p>{tr("mobileEditor.goBackToTheDesktop")}</p>
              </div>
            )}
          </section>
        ) : null}

        {mode === "theme" ? (
          <section className="mobile-sheet">
            <h2>{tr("mobileEditor.desktopTheme")}</h2>
            <div className="mobile-theme-grid">
              {Object.values(THEME_PRESETS).map((theme) => (
                <button key={theme.id} className={document.theme.id === theme.id ? "selected" : ""} onClick={() => onTheme(theme)}>
                  <i style={{ background: theme.wall }}><b style={{ background: `linear-gradient(90deg,${theme.titleFrom},${theme.titleTo})` }} /></i>
                  <span>{themeLabel(theme)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {mode === "preview" ? (
          <section className="mobile-preview-mode">
            {previewWindow ? (
              <>
                <button className="mobile-back" type="button" onClick={() => setPreviewId(null)}>{tr("mobileEditor.previewDesktop")}</button>
                <RetroWindow title={previewWindow.title} theme={document.theme} appearance={previewWindow.appearance}>
                  <WindowRenderer window={previewWindow} theme={document.theme} onOpenWindow={setPreviewId} />
                </RetroWindow>
              </>
            ) : (
              <div className="mobile-icons" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0,1fr))` }}>
                {ordered.map((window) => (
                  <button key={window.id} type="button" onClick={() => setPreviewId(window.id)}>
                    <span className="file-icon" />
                    <small>{window.title}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      <nav className="mobile-editor-toolbar" aria-label={tr("mobileEditor.mobileEditingTools")}>
        <button className={mode === "add" ? "active" : ""} onClick={() => setMode("add")}><span>＋</span><small>{tr("mobileEditor.add")}</small></button>
        <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}><span>▤</span><small>{tr("mobileEditor.edit")}</small></button>
        <button className={mode === "theme" ? "active" : ""} onClick={() => setMode("theme")}><span>◉</span><small>{tr("mobileEditor.theme")}</small></button>
        <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}><span>▣</span><small>{tr("mobileEditor.preview")}</small></button>
      </nav>
    </div>
  );
}
