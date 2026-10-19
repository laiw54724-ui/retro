import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getIgDraftSession, type IgFieldDraft } from "./igDraftSession";
import type { DraftError, DraftResult } from "./igDraftValidation";
import styles from "./ocEditor.module.css";

type Draft = IgFieldDraft;
const DraftContext = createContext<{ drafts: Map<string, Draft>; epoch: number } | null>(null);

/** Session-only drafts survive profile/section switches, but never history travel or reload. */
export function IgDraftProvider({ children }: { children: ReactNode }) {
  const igDraftSession = getIgDraftSession();
  const epoch = useSyncExternalStore(igDraftSession.subscribe, igDraftSession.getEpoch);
  return <DraftContext.Provider value={{ drafts: igDraftSession.drafts, epoch }}>{children}</DraftContext.Provider>;
}

type Props = {
  draftKey: string; value: string; label: string; placeholder?: string;
  type?: "text" | "number"; min?: number; max?: number;
  validate: (text: string) => DraftResult;
  onCommit: (value: string) => void;
};
export function IgDraftInput(props: Props) {
  const context = useContext(DraftContext);
  const local = useRef(new Map<string, Draft>());
  return <DraftControl key={`${props.draftKey}:${context?.epoch ?? 0}`} {...props} drafts={context?.drafts ?? local.current} />;
}
function DraftControl({ draftKey, value, label, validate, onCommit, drafts, ...input }: Props & { drafts: Map<string, Draft> }) {
  const { t } = useTranslation("instagram");
  const id = useId();
  const [state, setState] = useState<Draft>(() => {
    const cached = drafts.get(draftKey);
    return cached?.base === value ? cached : { base: value, text: value };
  });
  const composing = useRef(false);
  const blurredDuringComposition = useRef(false);
  // Upstream changes win; an old draft may not overwrite undo or a newer source.
  const draft = state.base === value ? state : { base: value, text: value };
  const dirty = draft.text !== value;
  // Keep the current feedback footprint after commit/cancel. Removing it during
  // blur moves the button under the pointer before mouseup and loses that click.
  const feedback = useRef<{ error?: DraftError } | null>(null);
  const showFeedback = dirty || !!draft.error;
  if (showFeedback) feedback.current = { error: draft.error };
  const set = (next: Draft) => { drafts.set(draftKey, next); setState(next); getIgDraftSession().notifyControls(); };
  useEffect(() => {
    if (state.base !== value && drafts.has(draftKey)) {
      drafts.set(draftKey, { base: value, text: value }); getIgDraftSession().notifyControls();
    }
  }, [value, state.base, drafts, draftKey]);
  const cancel = () => { composing.current = false; blurredDuringComposition.current = false; set({ base: value, text: value }); };
  const commit = (text: string) => {
    if (text === value) { set({ base: value, text: value }); return; }
    const result = validate(text);
    if (!result.ok) { set({ base: value, text, error: result.error }); return; }
    set({ base: result.value, text: result.value });
    if (result.value !== value) onCommit(result.value);
  };
  return <span className={styles.draftField}>
    <input {...input} className="w98-input compact" aria-label={label} aria-invalid={!!draft.error} aria-describedby={dirty || draft.error ? `${id}-feedback` : undefined}
      value={draft.text} onChange={(event) => set({ base: value, text: event.target.value })}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(event) => {
        composing.current = false;
        set({ base: value, text: event.currentTarget.value });
        if (blurredDuringComposition.current) { blurredDuringComposition.current = false; commit(event.currentTarget.value); }
      }}
      onBlur={(event) => {
        if (composing.current) { blurredDuringComposition.current = true; return; }
        commit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); commit(event.currentTarget.value); }
      }} />
    {feedback.current ? <span className={styles.draftFeedback} style={{ visibility: showFeedback ? "visible" : "hidden" }}>
      <span id={`${id}-feedback`} className={feedback.current.error ? "ie-error" : "w98-hint"} role={showFeedback && feedback.current.error ? "alert" : undefined}>{feedback.current.error ? t(`inputDraft.${feedback.current.error}`) : t("inputDraft.pending")}</span>
      <button type="button" className="w98-btn small" aria-label={t("inputDraft.cancelField", { field: label })} onMouseDown={(event) => event.preventDefault()} onClick={cancel}>{t("inputDraft.cancel")}</button>
      <small className="w98-hint">{t("editorFlow.retainedDrafts")}</small>
    </span> : null}
  </span>;
}
