import { useCallback, useEffect, useRef, useState } from "react";
import { useBeforeUnload, useBlocker, type BlockerFunction } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { hasUnsavedEditorLocalWork } from "./editorLocalWork";
import { ModalDialog } from "../../components/ModalDialog";
import { useEditorStore } from "./store";

/** A response belongs to the mounted editor that sent it, even when the same site is reopened. */
export function useEditorSaveSession(siteId: string) {
  const session = useRef<{ siteId: string; active: boolean } | null>(null);
  useEffect(() => {
    const current = { siteId, active: true };
    session.current = current;
    return () => { current.active = false; };
  }, [siteId]);
  return useCallback(() => {
    const captured = session.current;
    return () => !!captured?.active && session.current === captured && useEditorStore.getState().siteId === captured.siteId;
  }, []);
}

function hasUnsavedWork(siteId: string) {
  const state = useEditorStore.getState();
  if (state.siteId !== siteId) return false;
  // The separate theme writer registers a transient preview. Reading it does not Apply it.
  const preview = "themePreview" in state && state.themePreview != null;
  return hasUnsavedEditorLocalWork(siteId) || preview || state.saveStatus === "dirty" || state.saveStatus === "saving" || state.saveStatus === "error";
}

type ExitAction = () => void | Promise<void>;

/** Covers canonical save state and registered theme preview, not module-local input buffers. */
export function useEditorLeaveGuard(siteId: string) {
  const { t } = useTranslation("editor");
  const [action, setAction] = useState<ExitAction | null>(null);
  const allowingExit = useRef(false);
  const blocker = useBlocker(useCallback<BlockerFunction>(({ currentLocation, nextLocation }) =>
    !allowingExit.current && currentLocation.pathname !== nextLocation.pathname && hasUnsavedWork(siteId), [siteId]));
  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (!allowingExit.current && hasUnsavedWork(siteId)) {
      event.preventDefault();
      event.returnValue = "";
    }
  }, [siteId]));

  const run = async (next: ExitAction) => {
    allowingExit.current = true;
    try { await next(); }
    finally { allowingExit.current = false; }
  };
  const requestLeave = (next: ExitAction) => {
    if (hasUnsavedWork(siteId)) setAction(() => next);
    else void run(next);
  };
  const stay = () => {
    setAction(null);
    if (blocker.state === "blocked") blocker.reset();
  };
  const leave = () => {
    if (blocker.state === "blocked") blocker.proceed();
    else if (action) { setAction(null); void run(action); }
  };
  const prompt = blocker.state === "blocked" || action ? (
    <ModalDialog title={t("saveSession.leaveTitle")} onClose={stay} dismissOnBackdrop={false} actions={<>
      <button type="button" className="w98-btn primary" data-autofocus onClick={stay}>{t("saveSession.stay")}</button>
      <button type="button" className="w98-btn" onClick={leave}>{t("saveSession.leave")}</button>
    </>}>
      <p>{t(hasUnsavedWork(siteId) ? "saveSession.unsavedBody" : "saveSession.savedBody")}</p>
    </ModalDialog>
  ) : null;
  // A current server access-loss redirect is not an author-initiated exit.
  return { prompt, requestLeave, leaveAfterAccessLoss: run };
}
