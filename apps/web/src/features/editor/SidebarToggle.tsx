import { useTranslation } from "react-i18next";

type Props = {
  side: "left" | "right";
  expanded: boolean;
  onToggle: () => void;
};

export function SidebarToggle({ side, expanded, onToggle }: Props) {
  const { t: tr } = useTranslation("editor");
  const panelName = side === "left" ? tr("sidebarToggle.leftToolbar") : tr("sidebarToggle.rightPropertiesPanel");
  const actionLabel = expanded ? tr("sidebarToggle.collapse", { panel: panelName }) : tr("sidebarToggle.expand", { panel: panelName });
  const direction = expanded === (side === "left") ? "left" : "right";

  return (
    <div className={`sidebar-toggle-rail sidebar-toggle-rail-${side}${expanded ? " expanded" : " collapsed"}`}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-label={actionLabel}
        title={actionLabel}
        aria-controls={`editor-${side}-panel`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className={`sidebar-toggle-mark points-${direction}`} aria-hidden="true" />
      </button>
    </div>
  );
}
