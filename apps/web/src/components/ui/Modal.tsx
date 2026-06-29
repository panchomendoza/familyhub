import type { ReactNode } from "react";
import { clsx } from "clsx";

interface ModalProps {
  open:        boolean;
  onClose:     () => void;
  bottomSheet?: boolean;
  maxWidth?:   number;
  boxShadow?:  string;
  children:    ReactNode;
  T?: unknown;
}

export function Modal({
  open,
  onClose,
  bottomSheet = false,
  maxWidth = 400,
  boxShadow,
  children,
}: ModalProps) {
  if (!open) return null;

  return (
    // Overlay: en mobile siempre bottom sheet, en sm+ centrado (a menos que bottomSheet=true)
    <div
      className={clsx(
        "fixed inset-0 z-[300] flex bg-black/50 overscroll-contain",
        bottomSheet
          ? "items-end"
          : "items-end sm:items-center sm:justify-center sm:p-5"
      )}
      onClick={onClose}
    >
      <div
        className={clsx(
          "w-full overflow-y-auto border",
          "bg-[var(--modal-bg)] border-[var(--border)]",
          // Mobile: siempre bottom sheet con bordes arriba y padding home indicator
          "rounded-t-2xl max-h-[92vh] p-5 pb-8",
          // sm+: dialog centrado con bordes completos (solo cuando no es bottomSheet)
          !bottomSheet && "sm:rounded-2xl sm:max-h-[90vh] sm:p-6 sm:pb-6"
        )}
        style={{
          maxWidth:  bottomSheet ? undefined : maxWidth,
          boxShadow: boxShadow ?? "0 20px 60px #0005",
        }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
