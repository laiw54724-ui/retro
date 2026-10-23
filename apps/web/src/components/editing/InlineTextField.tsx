import { forwardRef, useLayoutEffect, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type KeyboardEvent } from "react";
import { isComposing } from "./common";
type ValueProps = { historyKey?: string; onValueChange?: (value: string, historyKey?: string) => void; onEnter?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void };
export type InlineTextFieldProps = InputHTMLAttributes<HTMLInputElement> & ValueProps;
export const InlineTextField = forwardRef<HTMLInputElement, InlineTextFieldProps>(function InlineTextField({ className = "", historyKey, onValueChange, onChange, onEnter, onKeyDown, onCompositionStart, onCompositionEnd, ...props }, ref) {
  const composing = useRef(false);
  return <input {...props} ref={ref} className={`editing-text ${className}`} onChange={e => { onChange?.(e); onValueChange?.(e.currentTarget.value, historyKey); }} onCompositionStart={e => { composing.current = true; onCompositionStart?.(e); }} onCompositionEnd={e => { composing.current = false; onCompositionEnd?.(e); }} onKeyDown={e => { onKeyDown?.(e); if (!e.defaultPrevented && e.key === "Enter" && !isComposing(e, composing.current)) onEnter?.(e); }} />;
});
export type InlineTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & ValueProps;
export const InlineTextArea = forwardRef<HTMLTextAreaElement, InlineTextAreaProps>(function InlineTextArea({ className = "", historyKey, onValueChange, onChange, onEnter, onKeyDown, onCompositionStart, onCompositionEnd, value, ...props }, ref) {
  const field = useRef<HTMLTextAreaElement | null>(null), composing = useRef(false);
  useLayoutEffect(() => { const node = field.current; if (!node) return; const resize = () => { node.style.height = "auto"; node.style.height = `${node.scrollHeight}px`; }; resize(); const observer = new ResizeObserver(entries => { if (entries[0]?.contentRect.width !== width) { width = entries[0].contentRect.width; resize(); } }); let width = node.getBoundingClientRect().width; observer.observe(node); return () => observer.disconnect(); }, [value]);
  return <textarea {...props} value={value} rows={props.rows ?? 1} ref={node => { field.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }} className={`editing-text editing-textarea ${className}`} onChange={e => { onChange?.(e); onValueChange?.(e.currentTarget.value, historyKey); }} onCompositionStart={e => { composing.current = true; onCompositionStart?.(e); }} onCompositionEnd={e => { composing.current = false; onCompositionEnd?.(e); }} onKeyDown={e => { onKeyDown?.(e); if (!e.defaultPrevented && e.key === "Enter" && !isComposing(e, composing.current)) onEnter?.(e); }} />;
});
