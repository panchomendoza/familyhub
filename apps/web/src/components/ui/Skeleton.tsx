/**
 * Skeleton — base component con efecto shimmer para estados de carga.
 * Animación definida en Skeleton.module.css (ya no se inyecta en runtime).
 */
import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?:        string | number;
  height?:       string | number;
  borderRadius?: string | number;
  style?:        CSSProperties;
  dark?:         boolean | undefined;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 8,
  style,
  dark,
}: SkeletonProps) {
  return (
    <div
      className={styles.shimmer}
      data-dark={dark ? "true" : "false"}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}

/* ── Variantes ────────────────────────────────────────────────── */

export function SkeletonText({
  lines = 1,
  dark,
  gap = 8,
}: { lines?: number; dark?: boolean | undefined; gap?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={13}
          width={i === lines - 1 && lines > 1 ? "65%" : "100%"}
          dark={dark}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({
  height = 80,
  dark,
}: { height?: number; dark?: boolean | undefined }) {
  return (
    <div
      className={styles.card}
      data-dark={dark ? "true" : "false"}
      style={{ minHeight: height }}
    >
      <Skeleton height={12} width="45%" dark={dark} />
      <Skeleton height={22} width="60%" dark={dark} borderRadius={6} />
    </div>
  );
}

export function SkeletonRow({ dark }: { dark?: boolean | undefined }) {
  return (
    <div className={styles.row} data-dark={dark ? "true" : "false"}>
      <Skeleton width={36} height={36} borderRadius="50%" dark={dark} />
      <div className={styles.rowBody}>
        <Skeleton height={12} width="55%" dark={dark} />
        <Skeleton height={11} width="35%" dark={dark} />
      </div>
      <Skeleton width={60} height={12} dark={dark} />
    </div>
  );
}
