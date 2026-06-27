import { Modal } from "./Modal";
import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  open:          boolean;
  onClose:       () => void;
  onConfirm:     () => void;
  title:         string;
  description?:  string;
  confirmLabel?: string;
  confirmColor?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Eliminar",
  confirmColor = "#F74F7B",
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={360}>
      <p className={styles.title}>{title}</p>
      {description && (
        <p className={styles.description}>{description}</p>
      )}
      <div className={styles.actions} style={{ marginTop: description ? 0 : 16 }}>
        <button className={styles.btnCancel} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={styles.btnConfirm}
          style={{ background: confirmColor }}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
