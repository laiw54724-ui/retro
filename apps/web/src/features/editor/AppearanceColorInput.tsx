import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

type Props = { label: string; value: string; disabled?: boolean; onChange: (value: string) => void };
const validHex = /^#[0-9a-fA-F]{6}$/;

/** Incomplete typing stays in the field, never in the saved document. */
export function AppearanceColorInput({ label, value, disabled = false, onChange }: Props) {
  const { t: tr } = useTranslation("editor");
  const [text, setText] = useState(value);
  const id = useId();
  useEffect(() => setText(value), [value, disabled]);
  const invalid = !disabled && !validHex.test(text);
  const change = (next: string) => {
    setText(next);
    if (validHex.test(next)) onChange(next);
  };
  return (
    <div className="appearance-color-field">
      <label htmlFor={id}>{label}</label>
      <div className="appearance-color-inputs">
        <input type="color" aria-label={label} disabled={disabled} value={value} onChange={(event) => change(event.target.value)} />
        <input id={id} className="w98-input" type="text" aria-label={tr("appearanceColorInput.colorCode", { label })} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} spellCheck={false} autoComplete="off" disabled={disabled} value={text} onChange={(event) => change(event.target.value)} onBlur={() => { if (!validHex.test(text)) setText(value); }} />
      </div>
      {invalid ? <span id={`${id}-error`} className="appearance-color-error">{tr("appearanceColorInput.enterFollowedBySixHex")}</span> : null}
    </div>
  );
}
