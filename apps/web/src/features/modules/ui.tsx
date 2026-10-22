import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { translateSystemMessage } from "../../i18n/systemMessages";
import { i18n } from "../../i18n";
import { useTranslation } from "react-i18next";
import { normalizeImageUrl } from "@retrodesk/shared";
import { useAssetSourceState } from "../../lib/assetSource";

export const imageFailText = () => i18n.t("modules:ui.imageFailed");

export function MiniBtn({ children, label, danger, on, ...rest }: { children: ReactNode; label: string; danger?: boolean; on?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className={"mini-btn" + (danger ? " danger" : "") + (on ? " on" : "")} {...rest}>
      {children}
    </button>
  );
}

/** Hidden file input wrapped in a button-like label. Resets so picking the same file twice still fires. */
export function FilePick({ children, onFiles, multiple, disabled, className = "mini-btn wide", title, accept = "image/jpeg,image/png,image/webp,image/gif" }: { children: ReactNode; onFiles: (files: File[]) => void; multiple?: boolean; disabled?: boolean; className?: string; title?: string; accept?: string }) {
  const id = useId();
  function change(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) onFiles(files);
  }
  return (
    <label htmlFor={id} className={className} title={title} aria-disabled={disabled || undefined}>
      {children}
      <input id={id} type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={change} className="visually-hidden" />
    </label>
  );
}

/** <img> that swaps to a clear message if the URL cannot be loaded. */
export function SafeImg({ src, alt, className, style, compact }: { src: string; alt: string; className?: string; style?: React.CSSProperties; compact?: boolean }) {
  const { t: tr } = useTranslation("modules");
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const { source: resolved, status } = useAssetSourceState(src);
  if (status === "failed" || (resolved && failedSource === resolved)) return <div className={"img-fail" + (compact ? " compact" : "")} role="alert">{compact ? tr("ui.cantLoad") : imageFailText()}</div>;
  if (!resolved) return <span className={className} style={style} aria-label={alt} aria-busy={status === "loading" || undefined} />;
  return <img src={resolved} alt={alt} className={className} style={style} referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => setFailedSource(resolved)} />;
}

/**
 * Text field for an image link. Commits on blur/Enter: stores the raw input in `srcUrl`
 * and the normalised URL (Google Drive etc.) in `src`.
 */
export function ImageUrlField({ raw, placeholder, label, onCommit, onEdit, className = "ie small", maxLength = 2048, visibleLabel = false, draftState }: {
  raw: string;
  placeholder: string;
  label: string;
  onCommit: (raw: string, src: string | null) => void;
  /** Invalidate an in-flight source replacement before the draft URL is committed. */
  onEdit?: () => void;
  className?: string;
  maxLength?: number;
  visibleLabel?: boolean;
  /** Optional authoring-session state; ordinary image fields remain local. */
  draftState?: { text: string; error: string; setText: (text: string) => void; setError: (error: string) => void };
}) {
  const composing = useRef(false);
  const inputId = useId();
  const [localText, setLocalText] = useState(raw);
  const [localError, setLocalError] = useState("");
  const text = draftState?.text ?? localText;
  const error = draftState?.error ?? localError;
  const setText = draftState?.setText ?? setLocalText;
  const setError = draftState?.setError ?? setLocalError;
  useEffect(() => { setLocalText(raw); setLocalError(""); }, [raw]);

  function commit() {
    const value = text.trim();
    if (value === raw.trim()) { setError(""); return; }
    if (!value) {
      setError("");
      onCommit("", null);
      return;
    }
    const result = normalizeImageUrl(value);
    if (!result.ok) {
      setError(translateSystemMessage(result.reason));
      return;
    }
    setError("");
    onCommit(value, result.url);
  }

  return (
    <>
      {visibleLabel ? <label className="image-source-label" htmlFor={inputId}>{label}</label> : null}
      <input
        id={inputId}
        className={className}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={!!error}
        maxLength={maxLength}
        onChange={(event) => { onEdit?.(); setText(event.target.value); }}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter" && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); commit(); } }}
      />
      {error ? <span role="alert" className="ie-error">{error}</span> : null}
    </>
  );
}
