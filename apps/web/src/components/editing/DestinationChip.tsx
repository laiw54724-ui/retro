import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { editingStyle, type EditingAppearance } from "./common";
export const DestinationChip = forwardRef<HTMLButtonElement, EditingAppearance & ButtonHTMLAttributes<HTMLButtonElement> & { text: string; icon?: ReactNode; missing?: boolean; expanded?: boolean }>(function DestinationChip({ text, icon, missing, expanded, className = "", tv, mobile, style, title, ...props }, ref) {
  return <button {...props} ref={ref} type="button" className={`editing-destination ${className}`} title={title ?? text} aria-expanded={expanded} data-missing={missing || undefined} data-mobile={mobile || undefined} style={editingStyle(tv, style)}><span aria-hidden="true">{missing ? "⚠" : icon}</span><span className="editing-destination-text">{text}</span><span aria-hidden="true">▾</span></button>;
});
