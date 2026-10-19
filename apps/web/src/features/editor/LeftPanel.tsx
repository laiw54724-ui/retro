import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { THEME_PRESETS, type DesktopWindow, type RetroTheme, type SiteDocument } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { COMING_SOON, creatableModuleDefinitions, registry } from "../modules/registry";
import { ThemeAppearanceEditor } from "./ThemeAppearanceEditor";
import { FilePick } from "../modules/ui";
import { useLocaleFormatting } from "../../i18n/format";

type Tab = "add" | "layers" | "theme";
type ViewMap = Record<string, "min" | "closed" | "max">;

type Props = {
  document: SiteDocument;
  selectedId: string | null;
  view: ViewMap;
  onAdd: (type: DesktopWindow["type"]) => void;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onMoveLayer: (id: string, direction: -1 | 1) => void;
  onTheme: (theme: RetroTheme) => void;
  upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;
  initialTab?: Tab;
};

export function LeftPanel({ document, selectedId, view, onAdd, onSelect, onToggleVisible, onMoveLayer, onTheme, upload, initialTab = "add" }: Props) {
  const { t } = useTranslation("editor");
  const { fontFamily } = useLocaleFormatting();
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: Tab[] = ["add", "layers", "theme"];
  return (
    <aside id="editor-left-panel" className="left-panel2" aria-label={t("shell.toolsPanel")} style={{ fontFamily }}>
      <div role="tablist" className="w98-tabs" aria-label={t("shell.toolsTabs")}>
        {tabs.map((id) => <button key={id} role="tab" type="button" className="w98-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t(`tabs.${id}`)}</button>)}
      </div>
      <div className="w98-tabpanel w98-scroll panel-scroll" role="tabpanel">
        {tab === "add" ? <AddTab onAdd={onAdd} /> : null}
        {tab === "layers" ? <LayersTab document={document} selectedId={selectedId} view={view} onSelect={onSelect} onToggleVisible={onToggleVisible} onMoveLayer={onMoveLayer} /> : null}
        {tab === "theme" ? <ThemeAppearanceEditor theme={document.theme} onTheme={onTheme} upload={upload} /> : null}
      </div>
    </aside>
  );
}

function AddTab({ onAdd }: { onAdd: Props["onAdd"] }) {
  const { t } = useTranslation("editor");
  // The legacy coming-soon list contains product labels, not persisted window data.
  const comingSoonKeys: Record<string, "add.diary" | "add.characterProfile" | "add.visualNovel"> = { "日記": "add.diary", "角色檔案": "add.characterProfile", "視覺小說": "add.visualNovel" }; // i18n-ignore: lookup keys of legacy product labels
  return (
    <>
      <strong>{t("add.heading")}</strong>
      <span className="w98-hint">{t("add.hint")}</span>
      {creatableModuleDefinitions.map((module) => (
        <button key={module.type} type="button" className="w98-btn add-card" onClick={() => onAdd(module.type)}>
          <Icon name={module.icon} size={32} />
          <span className="add-card-text"><strong>{t(`modules.${module.type}.label`, { defaultValue: module.label })}</strong><span>{t(`modules.${module.type}.description`, { defaultValue: module.description })}</span></span>
        </button>
      ))}
      <div className="w98-sep" />
      <strong style={{ color: "var(--w98-muted)" }}>{t("add.comingSoon")}</strong>
      <div className="soon">{COMING_SOON.map((name) => <span key={name}>{comingSoonKeys[name] ? t(comingSoonKeys[name], { defaultValue: name }) : name}</span>)}</div>
    </>
  );
}

function LayersTab({ document, selectedId, view, onSelect, onToggleVisible, onMoveLayer }: Pick<Props, "document" | "selectedId" | "view" | "onSelect" | "onToggleVisible" | "onMoveLayer">) {
  const { t: tr } = useTranslation("editor");
  const ordered = [...document.windows].sort((a, b) => b.layout.desktop.z - a.layout.desktop.z);
  return (
    <>
      <strong>{tr("leftPanel.windowsAndLayers")}</strong>
      <span className="w98-hint">{tr("leftPanel.windowsOnTopAreStacked")}</span>
      {ordered.length === 0 ? <span className="layers-empty">{tr("leftPanel.noWindowsYet")}</span> : null}
      <div className="layers w98-sunken">
        {ordered.map((window, index) => {
          const hidden = view[window.id] === "closed" || view[window.id] === "min";
          const selected = selectedId === window.id;
          return (
            <div key={window.id} className={"layer" + (selected ? " selected" : "")}>
              <button type="button" className="layer-main" onClick={() => onSelect(window.id)}>
                <Icon name={window.icon} size={18} />
                <span className="layer-text"><span className="layer-title">{window.title}</span><small>{hidden ? tr("leftPanel.hidden") : tr("leftPanel.showing")}</small></span>
              </button>
              <button type="button" className="mini-btn" onClick={() => onToggleVisible(window.id)}>{hidden ? tr("leftPanel.show") : tr("leftPanel.hide")}</button>
              <button type="button" className="mini-btn" aria-label={tr("leftPanel.moveForwardOneLayer")} disabled={index === 0} onClick={() => onMoveLayer(window.id, 1)}>▲</button>
              <button type="button" className="mini-btn" aria-label={tr("leftPanel.moveBackOneLayer")} disabled={index === ordered.length - 1} onClick={() => onMoveLayer(window.id, -1)}>▼</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
