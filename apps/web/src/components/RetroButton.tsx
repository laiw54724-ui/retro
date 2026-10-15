import type { ButtonHTMLAttributes } from "react";

export function RetroButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`retro-button ${className}`} {...props} />;
}
