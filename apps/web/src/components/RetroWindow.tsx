import type { CSSProperties, ReactNode } from "react";
import type { RetroTheme } from "@retrodesk/shared";

export function RetroWindow({ title, theme, children, style, active = true }: { title: string; theme: RetroTheme; children: ReactNode; style?: CSSProperties; active?: boolean }) {
  return (
    <section className="retro-window" style={{ background: theme.face, color: theme.text, ...style }} role="dialog" aria-label={title}>
      <div className="retro-titlebar" style={{ background: active ? `linear-gradient(90deg, ${theme.titleFrom}, ${theme.titleTo})` : `linear-gradient(90deg, ${theme.shadow}, ${theme.light})`, color: active ? "#fff" : theme.text }}>
        <strong>{title}</strong>
        <span className="titlebar-controls" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div className="retro-window-body">{children}</div>
    </section>
  );
}
