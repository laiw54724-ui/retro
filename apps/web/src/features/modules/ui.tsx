import { useEffect, useId, useState, type ChangeEvent, type ReactNode } from "react";
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
export function ImageUrlField({ raw, placeholder, label, onCommit, className = "ie small", maxLength = 2048 }: {
  raw: string;
  placeholder: string;
  label: string;
  onCommit: (raw: string, src: string | null) => void;
  className?: string;
  maxLength?: number;
}) {
  const [text, setText] = useState(raw);
  const [error, setError] = useState("");
  useEffect(() => setText(raw), [raw]);

  function commit() {
    const value = text.trim();
    if (value === raw.trim()) return;
    if (!value) {
      setError("");
      onCommit("", null);
      return;
    }
    const result = normalizeImageUrl(value);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError("");
    onCommit(value, result.url);
  }

  return (
    <>
      <input
        className={className}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={!!error}
        maxLength={maxLength}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }}
      />
      {error ? <span role="alert" className="ie-error">{error}</span> : null}
    </>
  );
}
