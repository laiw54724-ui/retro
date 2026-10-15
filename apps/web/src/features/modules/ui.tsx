import { useEffect, useId, useState, type ChangeEvent, type ReactNode } from "react";
import { normalizeImageUrl } from "@retrodesk/shared";
import { useAssetSource } from "../../lib/assetSource";

export const IMAGE_FAIL_TEXT = "圖片無法載入。Google 雲端連結請設為「知道連結的任何人」。";

export function MiniBtn({ children, label, danger, on, ...rest }: { children: ReactNode; label: string; danger?: boolean; on?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className={"mini-btn" + (danger ? " danger" : "") + (on ? " on" : "")} {...rest}>
      {children}
    </button>
  );
}

/** Hidden file input wrapped in a button-like label. Resets so picking the same file twice still fires. */
export function FilePick({ children, onFiles, multiple, className = "mini-btn wide", title }: { children: ReactNode; onFiles: (files: File[]) => void; multiple?: boolean; className?: string; title?: string }) {
  const id = useId();
  function change(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) onFiles(files);
  }
  return (
    <label htmlFor={id} className={className} title={title}>
      {children}
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={multiple} onChange={change} className="visually-hidden" />
    </label>
  );
}

/** <img> that swaps to a clear message if the URL cannot be loaded. */
export function SafeImg({ src, alt, className, style, compact }: { src: string; alt: string; className?: string; style?: React.CSSProperties; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const resolved = useAssetSource(src);
  useEffect(() => setFailed(false), [src, resolved]);
  if (failed) return <div className={"img-fail" + (compact ? " compact" : "")} role="alert">{compact ? "無法載入" : IMAGE_FAIL_TEXT}</div>;
  if (!resolved) return <span className={className} style={style} aria-label={alt} />;
  return <img src={resolved} alt={alt} className={className} style={style} referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/**
 * Text field for an image link. Commits on blur/Enter: stores the raw input in `srcUrl`
 * and the normalised URL (Google Drive etc.) in `src`.
 */
export function ImageUrlField({ raw, placeholder, label, onCommit, className = "ie small" }: {
  raw: string;
  placeholder: string;
  label: string;
  onCommit: (raw: string, src: string | null) => void;
  className?: string;
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
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }}
      />
      {error ? <span role="alert" className="ie-error">{error}</span> : null}
    </>
  );
}
