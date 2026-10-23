import { useEffect, useRef, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { ImageUrlInput } from "../ui";
import { useIgSessionValue } from "./useIgSessionValue";

type SourceDraft = { base: string; text: string; error: string };
/** Preserve uncommitted source text through task changes and Done editing. */
export function IgImageUrlField({ draftKey, ...props }: ComponentProps<typeof ImageUrlInput> & { draftKey: string }) {
  const { t } = useTranslation("instagram");
  const fresh = { base: props.raw, text: props.raw, error: "" };
  const [stored, setStored] = useIgSessionValue<SourceDraft>(draftKey, fresh);
  const draft = stored.base === props.raw ? stored : fresh;
  useEffect(() => {
    if (stored.base !== props.raw) setStored({ base: props.raw, text: props.raw, error: "" });
  }, [stored.base, props.raw]);
  const pending = draft.text !== props.raw || !!draft.error;
  const feedback = useRef(false);
  if (pending) feedback.current = true;
  return <>
    <ImageUrlInput {...props} draftState={{ ...draft,
      setText: (text) => setStored({ base: props.raw, text, error: "" }),
      setError: (error) => setStored((current) => ({ ...(current.base === props.raw ? current : fresh), error })),
    }} />
    {feedback.current ? <span className="ig-source-draft-feedback" style={{ visibility: pending ? "visible" : "hidden" }}>
      <small className="w98-hint">{t("editorFlow.retainedDrafts")}</small>
      <button type="button" className="w98-btn small" aria-label={t("inputDraft.cancelField", { field: props.label })} onMouseDown={(event) => event.preventDefault()} onClick={() => setStored(fresh)}>{t("inputDraft.cancel")}</button>
    </span> : null}
  </>;
}
