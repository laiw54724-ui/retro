type Props = {
  side: "left" | "right";
  expanded: boolean;
  onToggle: () => void;
};

export function SidebarToggle({ side, expanded, onToggle }: Props) {
  const panelName = side === "left" ? "左側工具欄" : "右側屬性欄";
  const actionLabel = `${expanded ? "收合" : "展開"}${panelName}`;
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
