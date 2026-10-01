import React from "react";
import { formatNumber } from "../telematics/telematicsFormat";

/**
 * One signal's latest values across trucks drawn against its own normal band:
 * shaded band, warning (amber) and critical (red) ticks, P25–P75 box, P5–P95 whiskers, median.
 */
export default function BandStrip({ row }) {
  const { signal, domain } = row;
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const pos = (v) => `${Math.min(100, Math.max(0, ((v - lo) / span) * 100))}%`;
  const digits = span < 20 ? 1 : 0;
  const flagged = row.states.critical + row.states.warning;

  return (
    <div className="grid grid-cols-[150px_1fr_88px] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-700" title={signal.signal_name}>
          {signal.signal_name}
        </p>
        <p className="text-[10px] text-slate-400">
          normal {formatNumber(signal.normal_min, digits)}–{formatNumber(signal.normal_max, digits)} {signal.unit}
        </p>
      </div>
      <div
        className="relative h-6"
        title={
          row.n
            ? `${signal.signal_name}: median ${formatNumber(row.p50, digits)} ${signal.unit} · P25–P75 ${formatNumber(row.p25, digits)}–${formatNumber(row.p75, digits)} · P5–P95 ${formatNumber(row.p5, digits)}–${formatNumber(row.p95, digits)} (${row.n} trucks)`
            : "No readings"
        }
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-100" />
        <div
          className="absolute top-0.5 bottom-0.5 rounded-sm bg-emerald-100"
          style={{ left: pos(signal.normal_min), width: `calc(${pos(signal.normal_max)} - ${pos(signal.normal_min)})` }}
        />
        {signal.warn_threshold !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400" style={{ left: pos(signal.warn_threshold) }} />}
        {signal.crit_threshold !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-rose-500" style={{ left: pos(signal.crit_threshold) }} />}
        {row.n > 0 && (
          <>
            <div
              className="absolute top-1/2 h-px -translate-y-1/2 bg-slate-500"
              style={{ left: pos(row.p5), width: `calc(${pos(row.p95)} - ${pos(row.p5)})` }}
            />
            <div
              className="absolute top-1.5 bottom-1.5 rounded-sm border border-slate-500 bg-white/70"
              style={{ left: pos(row.p25), width: `max(3px, calc(${pos(row.p75)} - ${pos(row.p25)}))` }}
            />
            <div className="absolute top-1 bottom-1 w-0.5 bg-slate-900" style={{ left: pos(row.p50) }} />
          </>
        )}
      </div>
      <div className="text-right text-[11px] tabular-nums">
        {flagged > 0 ? (
          <span className="font-semibold text-rose-600">
            {row.states.critical} crit · {row.states.warning} warn
          </span>
        ) : (
          <span className="text-slate-400">{row.states.outside ? `${row.states.outside} outside` : "all normal"}</span>
        )}
      </div>
    </div>
  );
}
