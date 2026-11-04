import type { ReactNode } from "react";
import { ModalDialog } from "../ModalDialog";
import "./mobile-editing.css";

/** Uses the app's existing modal focus, inert-background and opener contract. */
export function BottomSheet({ open, title, onClose, children, actions, className = "" }: { open: boolean; title: string; onClose(): void; children: ReactNode; actions?: ReactNode; className?: string }) {
  if (!open) return null;
  return <ModalDialog title={title} onClose={onClose} width={560} className={`editing-bottom-sheet m-sheet ${className}`} bodyClassName="editing-sheet-body" actions={actions}>{children}</ModalDialog>;
}
