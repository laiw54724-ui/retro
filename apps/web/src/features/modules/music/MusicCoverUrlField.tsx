import { useEffect, useRef, useState } from "react";
import { InlineTextField } from "../../../components/editing";
import { normalizeImageUrl } from "@retrodesk/shared";
import { translateSystemMessage } from "../../../i18n/systemMessages";

export type CoverDraftCache = Map<string, { raw: string; text: string; error: string }>;

/** Selected-track fields may unmount; unfinished URLs belong to that track. */
export function MusicCoverUrlField({ raw, label, placeholder, onCommit, onEdit, draftKey, drafts }: {
  raw: string; label: string; placeholder: string;
  onCommit: (raw: string, src: string | null) => void;
  onEdit: () => void; draftKey: string; drafts: CoverDraftCache;
}) {
  const cached = drafts.get(draftKey);
  const initial = cached?.raw === raw ? cached : { raw, text: raw, error: "" };
  const [text, setText] = useState(initial.text);
  const [error, setError] = useState(initial.error);
  const lastRaw = useRef(raw);
  useEffect(() => {
    if (lastRaw.current !== raw) { lastRaw.current = raw; setText(raw); setError(""); }
  }, [raw]);
  useEffect(() => { drafts.set(draftKey, { raw, text, error }); }, [drafts, draftKey, raw, text, error]);
  const commit = () => {
    const value = text.trim();
    if (value === raw.trim()) return;
    if (!value) { setError(""); onCommit("", null); return; }
    const result = normalizeImageUrl(value);
    if (!result.ok) { setError(translateSystemMessage(result.reason)); return; }
    setError(""); onCommit(value, result.url);
  };
  return <label className="image-source-field"><span>{label}</span>
    <InlineTextField className="ie small" value={text} placeholder={placeholder} aria-label={label} aria-invalid={!!error} maxLength={2048}
      onChange={(event) => { onEdit(); drafts.set(draftKey, { raw, text: event.target.value, error }); setText(event.target.value); }} onBlur={commit}
      onEnter={(event) => { event.preventDefault(); commit(); }} />
    {error ? <span role="alert" className="ie-error">{error}</span> : null}
  </label>;
}
