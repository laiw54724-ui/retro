import { forwardRef, type ButtonHTMLAttributes } from "react";

/** Win98 button. Pass className "primary", "small", "danger" or "block" for variants. */
export const RetroButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function RetroButton(
  { className = "", type = "button", ...props },
  ref
) {
  return <button ref={ref} type={type} className={`w98-btn retro-button ${className}`} {...props} />;
});
