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
    <div
      className={clsx(
        "fixed inset-0 z-[300] flex bg-black/50 overscroll-contain p-4",
        bottomSheet ? "items-end p-0" : "items-center justify-center"
      )}
    >
      <div
        className={clsx(
          "w-full overflow-y-auto border bg-[var(--modal-bg)] border-[var(--border)]",
          bottomSheet
            ? "rounded-t-2xl max-h-[92vh] p-5 pb-8"
            : "rounded-2xl max-h-[90vh] p-5"
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
