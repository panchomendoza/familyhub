import type { ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  open:         boolean;
  onClose:      () => void;
  /** Slide up from bottom (mobile sheet style). Default false = centered dialog. */
  bottomSheet?: boolean;
  maxWidth?:    number;
  /** Extra box-shadow on the panel */
  boxShadow?:   string;
  children:     ReactNode;
  // T kept for API compat — no longer needed internally
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
      className={`${styles.overlay} ${bottomSheet ? styles.sheet : ""}`}
    >
      <div
        className={`${styles.panel} ${bottomSheet ? styles.sheet : ""}`}
        style={{
          maxWidth:   bottomSheet ? undefined : maxWidth,
          boxShadow:  boxShadow ?? "0 20px 60px #0005",
        }}
      >
        {children}
      </div>
    </div>
  );
}
