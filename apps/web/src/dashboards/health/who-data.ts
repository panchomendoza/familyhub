/* ════════════════════════════════════════════════════════
   Datos de curvas de crecimiento OMS (percentiles P3/P50/P97)
   Fuente: WHO Child Growth Standards
   ════════════════════════════════════════════════════════ */

export interface OmsPoint {
  m:   number; // meses
  p3:  number;
  p50: number;
  p97: number;
}

/* ── Peso (kg) ── */
export const OMS_PESO_F: OmsPoint[] = [
  { m: 0,  p3: 2.4,  p50: 3.2,  p97: 4.2  },
  { m: 1,  p3: 3.2,  p50: 4.2,  p97: 5.5  },
  { m: 2,  p3: 3.9,  p50: 5.1,  p97: 6.6  },
  { m: 3,  p3: 4.5,  p50: 5.8,  p97: 7.5  },
  { m: 4,  p3: 5.0,  p50: 6.4,  p97: 8.2  },
  { m: 5,  p3: 5.4,  p50: 6.9,  p97: 8.8  },
  { m: 6,  p3: 5.7,  p50: 7.3,  p97: 9.3  },
  { m: 9,  p3: 6.5,  p50: 8.2,  p97: 10.5 },
  { m: 12, p3: 7.1,  p50: 9.0,  p97: 11.5 },
  { m: 15, p3: 7.6,  p50: 9.6,  p97: 12.4 },
  { m: 18, p3: 8.1,  p50: 10.2, p97: 13.2 },
  { m: 24, p3: 8.9,  p50: 11.5, p97: 14.9 },
];
export const OMS_PESO_M: OmsPoint[] = [
  { m: 0,  p3: 2.5,  p50: 3.3,  p97: 4.4  },
  { m: 1,  p3: 3.4,  p50: 4.5,  p97: 5.8  },
  { m: 2,  p3: 4.3,  p50: 5.6,  p97: 7.1  },
  { m: 3,  p3: 5.0,  p50: 6.4,  p97: 8.0  },
  { m: 4,  p3: 5.6,  p50: 7.0,  p97: 8.7  },
  { m: 5,  p3: 6.1,  p50: 7.5,  p97: 9.3  },
  { m: 6,  p3: 6.4,  p50: 7.9,  p97: 9.8  },
  { m: 9,  p3: 7.2,  p50: 8.9,  p97: 11.0 },
  { m: 12, p3: 7.8,  p50: 9.6,  p97: 11.9 },
  { m: 15, p3: 8.4,  p50: 10.3, p97: 12.8 },
  { m: 18, p3: 8.9,  p50: 10.9, p97: 13.5 },
  { m: 24, p3: 9.7,  p50: 12.0, p97: 15.0 },
];

/* ── Talla (cm) ── */
export const OMS_TALLA_F: OmsPoint[] = [
  { m: 0,  p3: 45.6, p50: 49.1, p97: 52.9 },
  { m: 1,  p3: 49.8, p50: 53.7, p97: 57.6 },
  { m: 2,  p3: 52.9, p50: 57.1, p97: 61.1 },
  { m: 3,  p3: 55.6, p50: 59.8, p97: 64.0 },
  { m: 4,  p3: 57.8, p50: 62.1, p97: 66.4 },
  { m: 5,  p3: 59.6, p50: 64.0, p97: 68.5 },
  { m: 6,  p3: 61.2, p50: 65.7, p97: 70.3 },
  { m: 9,  p3: 65.3, p50: 70.1, p97: 75.0 },
  { m: 12, p3: 68.9, p50: 74.0, p97: 79.2 },
  { m: 15, p3: 72.0, p50: 77.5, p97: 83.0 },
  { m: 18, p3: 74.9, p50: 80.7, p97: 86.5 },
  { m: 24, p3: 80.0, p50: 86.4, p97: 92.9 },
];
export const OMS_TALLA_M: OmsPoint[] = [
  { m: 0,  p3: 46.1, p50: 49.9, p97: 53.7 },
  { m: 1,  p3: 50.8, p50: 54.7, p97: 58.6 },
  { m: 2,  p3: 54.4, p50: 58.4, p97: 62.4 },
  { m: 3,  p3: 57.3, p50: 61.4, p97: 65.5 },
  { m: 4,  p3: 59.7, p50: 63.9, p97: 68.0 },
  { m: 5,  p3: 61.7, p50: 65.9, p97: 70.1 },
  { m: 6,  p3: 63.3, p50: 67.6, p97: 71.9 },
  { m: 9,  p3: 67.7, p50: 72.0, p97: 76.5 },
  { m: 12, p3: 71.0, p50: 75.7, p97: 80.5 },
  { m: 15, p3: 74.1, p50: 79.1, p97: 84.2 },
  { m: 18, p3: 76.9, p50: 82.3, p97: 87.7 },
  { m: 24, p3: 82.3, p50: 87.8, p97: 93.5 },
];

/* ── Perímetro cefálico (cm) ── */
export const OMS_PC_F: OmsPoint[] = [
  { m: 0,  p3: 31.7, p50: 33.9, p97: 36.1 },
  { m: 1,  p3: 33.8, p50: 36.1, p97: 38.4 },
  { m: 2,  p3: 35.4, p50: 37.8, p97: 40.2 },
  { m: 3,  p3: 36.7, p50: 39.1, p97: 41.5 },
  { m: 4,  p3: 37.7, p50: 40.2, p97: 42.6 },
  { m: 5,  p3: 38.6, p50: 41.0, p97: 43.5 },
  { m: 6,  p3: 39.3, p50: 41.7, p97: 44.1 },
  { m: 9,  p3: 41.0, p50: 43.5, p97: 46.0 },
  { m: 12, p3: 42.2, p50: 44.7, p97: 47.2 },
  { m: 15, p3: 43.1, p50: 45.7, p97: 48.2 },
  { m: 18, p3: 43.9, p50: 46.4, p97: 48.9 },
  { m: 24, p3: 45.1, p50: 47.6, p97: 50.1 },
];
export const OMS_PC_M: OmsPoint[] = [
  { m: 0,  p3: 32.1, p50: 34.5, p97: 36.9 },
  { m: 1,  p3: 34.9, p50: 37.3, p97: 39.7 },
  { m: 2,  p3: 36.7, p50: 39.1, p97: 41.5 },
  { m: 3,  p3: 38.1, p50: 40.5, p97: 42.9 },
  { m: 4,  p3: 39.2, p50: 41.6, p97: 44.0 },
  { m: 5,  p3: 40.1, p50: 42.6, p97: 45.0 },
  { m: 6,  p3: 40.9, p50: 43.3, p97: 45.7 },
  { m: 9,  p3: 42.5, p50: 45.0, p97: 47.5 },
  { m: 12, p3: 43.8, p50: 46.3, p97: 48.8 },
  { m: 15, p3: 44.8, p50: 47.3, p97: 49.8 },
  { m: 18, p3: 45.6, p50: 48.1, p97: 50.6 },
  { m: 24, p3: 47.0, p50: 49.5, p97: 52.0 },
];

/* ── Helpers ── */
export function calcMonths(birthdate: string | null | undefined, atDate: string): number | null {
  if (!birthdate || !atDate) return null;
  const bd = new Date(birthdate);
  const at = new Date(atDate);
  if (isNaN(bd.getTime()) || isNaN(at.getTime())) return null;
  let m = (at.getFullYear() - bd.getFullYear()) * 12 + (at.getMonth() - bd.getMonth());
  if (at.getDate() < bd.getDate()) m--;
  return Math.max(0, m);
}

export function interpolateOMS(tabla: OmsPoint[], mes: number): OmsPoint | null {
  if (!tabla.length) return null;
  const first = tabla[0] ?? null;
  const last  = tabla[tabla.length - 1] ?? null;
  if (!first || !last) return null;
  if (mes <= first.m) return first;
  if (mes >= last.m)  return last;
  for (let i = 0; i < tabla.length - 1; i++) {
    const a = tabla[i];
    const b = tabla[i + 1];
    if (!a || !b) continue;
    if (mes >= a.m && mes <= b.m) {
      const t = (mes - a.m) / (b.m - a.m);
      return {
        m:   mes,
        p3:  a.p3  + t * (b.p3  - a.p3),
        p50: a.p50 + t * (b.p50 - a.p50),
        p97: a.p97 + t * (b.p97 - a.p97),
      };
    }
  }
  return null;
}
