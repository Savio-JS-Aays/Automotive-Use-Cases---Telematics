import React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import Hover from "./Hover";

/**
 * Donut with the total in the centre and one rounded legend row per slice
 * (dot, name, value, share chip and a progress bar).
 *
 * data         [{ name, value, color }]
 * centerLabel  small caps text above the total
 * onSliceClick (slice) → void; makes the donut slices and legend rows clickable
 */
export default function DonutBreakdown({ data, centerLabel = "Total", valueSuffix = "", onSliceClick, formatValue }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmt = formatValue ?? ((v) => v.toLocaleString("en-IN"));
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={0}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
              onClick={onSliceClick ? (s) => onSliceClick(s.payload ?? s) : undefined}
              className={onSliceClick ? "cursor-pointer" : ""}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-slate-300">
                      {fmt(d.value)} · {total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0"}%
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{centerLabel}</span>
          <span className="text-2xl font-bold tabular-nums text-slate-900">{fmt(total)}</span>
          {valueSuffix && <span className="text-[11px] text-slate-400">{valueSuffix}</span>}
        </div>
      </div>
      <div className="w-full flex-1 space-y-2.5">
        {data.map((d) => {
          const share = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <Hover
              as={onSliceClick ? "button" : "div"}
              content={`${d.name}: ${fmt(d.value)} (${share.toFixed(1)}% of ${fmt(total)})`}
              key={d.name}
              type={onSliceClick ? "button" : undefined}
              onClick={onSliceClick ? () => onSliceClick(d) : undefined}
              className={`block w-full rounded-xl border border-slate-100 bg-white px-3.5 py-2.5 text-left shadow-sm ${
                onSliceClick ? "cursor-pointer transition-colors hover:border-slate-200 hover:bg-slate-50/60" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="flex-1 truncate text-sm font-semibold text-slate-700">{d.name}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-800">{fmt(d.value)}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-500">
                  {share.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: d.color }} />
              </div>
            </Hover>
          );
        })}
      </div>
    </div>
  );
}
