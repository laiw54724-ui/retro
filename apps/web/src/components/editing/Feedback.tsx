import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { editingStyle, useEditingText, type EditingAppearance } from "./common";
export function InlineErrorBanner({ message, onClose, tv, mobile, className = "", style, ...props }: EditingAppearance & Omit<HTMLAttributes<HTMLDivElement>, "children"> & { message?: ReactNode; onClose: () => void }) {
  const text = useEditingText();
  return message ? <div {...props} role="alert" className={`editing-error ${className}`} data-mobile={mobile || undefined} style={editingStyle(tv, style)}><span>{message}</span><button type="button" onMouseDown={e => e.preventDefault()} onClick={onClose} aria-label={text("close")}>×</button></div> : null;
}
export function EditorStatusBar({ message, problem, count, temporaryMessage, temporaryMs = 3000, tv, mobile, className = "", style, children, ...props }: EditingAppearance & HTMLAttributes<HTMLDivElement> & { message: ReactNode; problem?: ReactNode; count?: ReactNode; temporaryMessage?: string; temporaryMs?: number }) {
  const [temporary, setTemporary] = useState(temporaryMessage);
  useEffect(() => { setTemporary(temporaryMessage); if (!temporaryMessage) return; const timer = setTimeout(() => setTemporary(undefined), temporaryMs); return () => clearTimeout(timer); }, [temporaryMessage, temporaryMs]);
  return <div {...props} className={`editing-status ${className}`} data-mobile={mobile || undefined} style={editingStyle(tv, style)}><span role="status" aria-live="polite" aria-atomic="true">{problem || temporary || message}</span>{children}{count !== undefined && <span className="editing-count">{count}</span>}</div>;
}
