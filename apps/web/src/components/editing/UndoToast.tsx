import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./mobile-editing.css";

/** The owner retains pending operations and flushes them on scope exit. */
export function UndoToast({ message, onUndo, onExpire, hidden, duration = 5000 }: { message: ReactNode; onUndo?: () => void; onExpire(): void; hidden?: boolean; duration?: number }) {
  const { t } = useTranslation("editor");
  const expire = useRef(onExpire); expire.current = onExpire;
  useEffect(() => { const timer = setTimeout(() => expire.current(), duration); return () => clearTimeout(timer); }, [duration, message]);
  return <div className="editing-undo-toast" role="status" aria-live="polite" hidden={hidden} data-editing-owned-portal>{message}{onUndo ? <button type="button" className="w98-btn" onClick={onUndo}>{t("shell.undo")}</button> : null}</div>;
}
