import { useMemo } from "react";

interface PaginationProps {
  currentPage:  number;           // página actual (1-indexed)
  totalPages:   number;
  onPageChange: (page: number) => void;
  totalItems?:  number;           // opcional, para mostrar "X resultados"
  pageSize?:    number;           // opcional, para mostrar rango "1-20 de 75"
}

/** Genera la secuencia de páginas con puntos suspensivos */
function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [];

  const addRange = (from: number, to: number) => {
    for (let i = from; i <= to; i++) pages.push(i);
  };

  pages.push(1);

  if (current <= 4) {
    addRange(2, 5);
    pages.push("…");
  } else if (current >= total - 3) {
    pages.push("…");
    addRange(total - 4, total - 1);
  } else {
    pages.push("…");
    addRange(current - 1, current + 1);
    pages.push("…");
  }

  pages.push(total);
  return pages;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}: PaginationProps) {
  const pages = useMemo(() => buildPages(currentPage, totalPages), [currentPage, totalPages]);

  if (totalPages <= 1) return null;

  const rangeStart = pageSize ? (currentPage - 1) * pageSize + 1 : null;
  const rangeEnd   = pageSize && totalItems
    ? Math.min(currentPage * pageSize, totalItems)
    : null;

  return (
    <div className="flex flex-col items-center gap-3 py-2 select-none">

      {/* Texto de rango */}
      {totalItems != null && rangeStart != null && rangeEnd != null && (
        <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Mostrando {rangeStart}–{rangeEnd} de {totalItems} productos
        </p>
      )}

      <div className="flex items-center gap-1">

        {/* Anterior */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150
            disabled:opacity-30 disabled:cursor-not-allowed
            hover:not-disabled:scale-105"
          style={{
            background:  "var(--surface-alt)",
            border:      "1.5px solid var(--border)",
            color:       "var(--text-muted)",
            fontFamily:  "inherit",
          }}
          aria-label="Página anterior"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="hidden sm:inline">Anterior</span>
        </button>

        {/* Páginas */}
        <div className="flex items-center gap-1">
          {pages.map((p, i) =>
            p === "…" ? (
              <span
                key={`ellipsis-${i}`}
                className="w-9 h-9 flex items-center justify-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className="w-9 h-9 rounded-xl text-sm font-bold transition-all duration-150 hover:scale-105"
                style={
                  p === currentPage
                    ? {
                        background: "var(--brand-green)",
                        color:      "#fff",
                        border:     "1.5px solid var(--brand-green)",
                        boxShadow:  "0 2px 8px color-mix(in srgb, var(--brand-green) 35%, transparent)",
                        fontFamily: "inherit",
                      }
                    : {
                        background: "var(--surface-alt)",
                        color:      "var(--text-muted)",
                        border:     "1.5px solid var(--border)",
                        fontFamily: "inherit",
                      }
                }
                aria-label={`Página ${p}`}
                aria-current={p === currentPage ? "page" : undefined}
              >
                {p}
              </button>
            )
          )}
        </div>

        {/* Siguiente */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150
            disabled:opacity-30 disabled:cursor-not-allowed
            hover:not-disabled:scale-105"
          style={{
            background:  "var(--surface-alt)",
            border:      "1.5px solid var(--border)",
            color:       "var(--text-muted)",
            fontFamily:  "inherit",
          }}
          aria-label="Página siguiente"
        >
          <span className="hidden sm:inline">Siguiente</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

      </div>
    </div>
  );
}
