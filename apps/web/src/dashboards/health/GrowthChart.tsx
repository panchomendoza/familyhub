import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { Control, Child } from "@familyhub/types";
import {
  OMS_PESO_F, OMS_PESO_M,
  OMS_TALLA_F, OMS_TALLA_M,
  OMS_PC_F, OMS_PC_M,
  calcMonths, interpolateOMS,
} from "./who-data";

interface Props {
  child:    Child;
  controls: Control[];
  isDark:   boolean;
}

const GRAFICOS = [
  { key: "peso",  label: "Peso",        unit: "kg",   color: "#4F7BF7", campo: "peso"  },
  { key: "talla", label: "Talla",       unit: "cm",   color: "#34C78A", campo: "talla" },
  { key: "pc",    label: "P. Cefálico", unit: "cm",   color: "#A44FF7", campo: "pc"    },
  { key: "imc",   label: "IMC",         unit: "kg/m²",color: "#F7874F", campo: "imc"   },
] as const;

type GraficoKey = typeof GRAFICOS[number]["key"];

export function GrowthChart({ child, controls, isDark }: Props) {
  const [grafico, setGrafico] = useState<GraficoKey>("peso");

  const surface   = isDark ? "#1A2235" : "#ffffff";
  const border    = isDark ? "#2A3550" : "#E2E8F0";
  const text      = isDark ? "#E8EEFF" : "#1A2340";
  const textMuted = isDark ? "#6B7A99" : "#8A93A8";
  const surfaceAlt = isDark ? "#141C2E" : "#F8FAFF";
  const modalBg   = isDark ? "#1A2235" : "#ffffff";

  const isFemale = child.gender === "F";
  const omsP  = isFemale ? OMS_PESO_F  : OMS_PESO_M;
  const omsT  = isFemale ? OMS_TALLA_F : OMS_TALLA_M;
  const omsPC = isFemale ? OMS_PC_F    : OMS_PC_M;

  // Puntos del niño desde controles con medición
  const datos = controls
    .filter(c => c.date && (c.weight || c.height || c.headCirc))
    .map(c => {
      const mes = calcMonths(child.birthdate, c.date);
      const w   = c.weight   ?? null;
      const h   = c.height   ?? null;
      const pc  = c.headCirc ?? null;
      const imc = w && h ? parseFloat((w / ((h / 100) ** 2)).toFixed(1)) : null;
      return { mes, label: `${mes}m`, peso: w, talla: h, pc, imc };
    })
    .filter(d => d.mes !== null)
    .sort((a, b) => (a.mes ?? 0) - (b.mes ?? 0));

  if (datos.length < 2) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border py-12 text-center text-sm"
        style={{ background: surface, borderColor: border, color: textMuted }}
      >
        <span className="text-3xl">📊</span>
        <span className="font-bold text-base" style={{ color: text }}>
          Se necesitan al menos 2 controles con mediciones
        </span>
        <span>Agrega peso, talla o perímetro cefálico en los controles para ver las curvas.</span>
      </div>
    );
  }

  const maxMes = Math.max(...datos.map(d => d.mes ?? 0), 24);

  const omsTable = grafico === "peso"  ? omsP
                 : grafico === "talla" ? omsT
                 : grafico === "pc"    ? omsPC
                 : [];

  const omsData = omsTable.filter(p => p.m <= maxMes + 2);
  const allMeses = Array.from(
    new Set([...omsData.map(d => d.m), ...datos.map(d => d.mes as number)])
  ).sort((a, b) => a - b);

  const cfg = GRAFICOS.find(g => g.key === grafico)!;

  const chartData = allMeses.map(m => {
    const oms = grafico !== "imc" ? interpolateOMS(omsTable, m) : null;
    const kid = datos.find(d => d.mes === m);
    return {
      mes:   m,
      label: `${m}m`,
      P3:    oms ? parseFloat(oms.p3.toFixed(1))  : undefined,
      P50:   oms ? parseFloat(oms.p50.toFixed(1)) : undefined,
      P97:   oms ? parseFloat(oms.p97.toFixed(1)) : undefined,
      [cfg.campo]: kid ? kid[cfg.campo as keyof typeof kid] : undefined,
    };
  });

  const customTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-xl border px-3 py-2 text-xs shadow-lg"
        style={{ background: modalBg, borderColor: border, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        <div className="mb-1 font-bold" style={{ color: text }}>{label}</div>
        {payload.map((p: any) =>
          p.value != null ? (
            <div key={p.dataKey} style={{ color: p.color, fontWeight: p.dataKey === cfg.campo ? 700 : 400 }}>
              {p.name}: {p.value} {cfg.unit}
            </div>
          ) : null
        )}
      </div>
    );
  };

  // Último control stats
  const last    = datos[datos.length - 1]!;
  const lastRef = interpolateOMS(omsP, last.mes ?? 0);
  const status  = lastRef && last.peso
    ? last.peso < lastRef.p3  ? { label: "Bajo P3",       color: "#F74F7B" }
    : last.peso > lastRef.p97 ? { label: "Sobre P97",     color: "#F7874F" }
    : last.peso < lastRef.p50 ? { label: "Entre P3-P50",  color: "#34C78A" }
    :                           { label: "Entre P50-P97", color: "#34C78A" }
    : null;

  return (
    <div>
      {/* Selector */}
      <div className="mb-5 flex flex-wrap gap-2">
        {GRAFICOS.map(g => (
          <button
            key={g.key}
            onClick={() => setGrafico(g.key)}
            className="rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all"
            style={{
              borderColor: grafico === g.key ? g.color : border,
              background:  grafico === g.key ? g.color + "18" : surface,
              color:       grafico === g.key ? g.color : textMuted,
            }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Chart card */}
      <div className="rounded-2xl border" style={{ background: surface, borderColor: border }}>
        <div className="px-5 pt-5 pb-2">
          <span className="font-bold text-sm" style={{ color: text }}>{cfg.label}</span>
          <span className="ml-2 text-xs" style={{ color: textMuted }}>({cfg.unit})</span>
          {grafico !== "imc" && (
            <span className="ml-2 text-xs" style={{ color: textMuted }}>— Bandas OMS P3/P50/P97</span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} />
            <XAxis dataKey="label" tick={{ fill: textMuted, fontSize: 11 }} />
            <YAxis tick={{ fill: textMuted, fontSize: 11 }} width={40} />
            <Tooltip content={customTooltip} />
            <Legend wrapperStyle={{ fontSize: 12, color: textMuted, paddingBottom: 8 }} />
            {grafico !== "imc" && (
              <>
                <Line dataKey="P3"  name="P3 OMS"  stroke={border}     strokeWidth={1} strokeDasharray="4 4" dot={false} />
                <Line dataKey="P50" name="P50 OMS" stroke={cfg.color}  strokeWidth={1} strokeDasharray="4 4" dot={false} opacity={0.5} />
                <Line dataKey="P97" name="P97 OMS" stroke={border}     strokeWidth={1} strokeDasharray="4 4" dot={false} />
              </>
            )}
            <Line
              dataKey={cfg.campo}
              name={`${cfg.label} (${child.name})`}
              stroke={cfg.color}
              strokeWidth={2.5}
              dot={{ fill: cfg.color, r: 5, strokeWidth: 2, stroke: surface }}
              activeDot={{ r: 7 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stats del último control */}
      <div className="mt-4 flex flex-wrap gap-3">
        {[
          { label: "Último peso",  value: last?.peso  ? `${last.peso} kg`  : "—", color: "#4F7BF7" },
          { label: "Última talla", value: last?.talla ? `${last.talla} cm` : "—", color: "#34C78A" },
          { label: "Último P.C.",  value: last?.pc    ? `${last.pc} cm`    : "—", color: "#A44FF7" },
          { label: "Último IMC",   value: last?.imc   ? `${last.imc}`      : "—", color: "#F7874F" },
          ...(status ? [{ label: "Percentil peso", value: status.label, color: status.color }] : []),
        ].map(item => (
          <div
            key={item.label}
            className="min-w-[90px] rounded-xl border p-3"
            style={{ background: surfaceAlt, borderColor: border }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>
              {item.label}
            </div>
            <div className="mt-0.5 text-lg font-extrabold" style={{ color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
