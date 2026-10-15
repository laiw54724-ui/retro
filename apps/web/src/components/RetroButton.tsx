import type { ButtonHTMLAttributes } from "react";

/** Win98 button. Pass className "primary", "small", "danger" or "block" for variants. */
export function RetroButton({ className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`w98-btn retro-button ${className}`} {...props} />;
}
