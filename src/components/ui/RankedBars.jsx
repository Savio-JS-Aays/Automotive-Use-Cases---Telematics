import React from "react";
import Hover from "./Hover";

/**
 * Ranked horizontal bars: label on the left, value on the right, a thick rounded track below.
 * One or several stacked segments per row. Replaces Recharts horizontal bar charts.
 *
 * rows         array of objects
 * getLabel     row → label text
 * segments     [{ key, color, name }]: stacked series, read from row[key]; or use getColor for one series
 * valueKey     single-series value, read from row[valueKey] (when `segments` is omitted)
 * getColor     row → colour for the single-series bar
 * formatValue  row → text shown on the right (defaults to the row total)
 * max          scale maximum (defaults to the largest row total)
 * reference    { value, label?, color? } dashed vertical marker on every track
 * renderDetail row → hover text / node (defaults to every segment's value and the total)
 * onRowClick   row → void (makes the row clickable)
 * onSegmentClick (row, segmentKey) → void; makes each stacked segment clickable
 * grouped      draw each segment as its own thin track (side by side) instead of stacking them
 */
export default function RankedBars({
  rows,
  getLabel,
  segments,
  valueKey,
  getColor,
  formatValue,
  max,
  reference,
  renderDetail,
  onRowClick,
  onSegmentClick,
  legend = true,
  grouped = false,
  trackClass = "h-3.5",
  className = "",
}) {
  const series = segments ?? [{ key: valueKey, color: "#0ea5e9", name: "" }];
  const totalOf = (r) => (grouped ? Math.max(...series.map((x) => Number(r[x.key]) || 0)) : series.reduce((s, x) => s + (Number(r[x.key]) || 0), 0));
  const scale = max ?? Math.max(...rows.map(totalOf), reference?.value ?? 0, 1);
  const defaultDetail = (r) =>
    segments
      ? `${series.map((x) => `${x.name}: ${(Number(r[x.key]) || 0).toLocaleString("en-IN")}`).join(" · ")}${
          grouped ? "" : ` · Total: ${totalOf(r).toLocaleString("en-IN")}`
        }`
      : formatValue
        ? formatValue(r)
        : totalOf(r).toLocaleString("en-IN");
  const pct = (v) => `${Math.min(100, Math.max(0, (v / scale) * 100))}%`;

  return (
    <div className={className}>
      {(segments || reference?.label) && legend && (
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
          {(segments ?? []).map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
          {reference?.label && (
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <span className="h-3 border-l-2 border-dashed" style={{ borderColor: reference.color ?? "#64748b" }} />
              {reference.label}
            </span>
          )}
        </div>
      )}
      <div className="space-y-3.5">
        {rows.map((r, i) => {
          const interactive = typeof onRowClick === "function";
          const detail = renderDetail ? renderDetail(r) : defaultDetail(r);
          return (
            <Hover
              as={interactive ? "button" : "div"}
              content={
                <>
                  <p className="font-semibold">{getLabel(r)}</p>
                  <p className="text-slate-300">{detail}</p>
                </>
              }
              key={getLabel(r) + i}
              type={interactive ? "button" : undefined}
              onClick={interactive ? () => onRowClick(r) : undefined}
              className={`relative block w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-50 ${interactive ? "cursor-pointer" : ""}`}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-slate-700" title={getLabel(r)}>
                  {getLabel(r)}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                  {formatValue ? formatValue(r) : totalOf(r).toLocaleString("en-IN")}
                </span>
              </div>
              {grouped ? (
                <div className="space-y-1">
                  {series.map((s) => (
                    <div key={s.key} className="relative h-2.5 w-full rounded-full bg-slate-100" title={`${s.name}: ${Number(r[s.key] || 0).toLocaleString("en-IN")}`}>
                      <div className="h-full rounded-full" style={{ width: pct(Number(r[s.key]) || 0), backgroundColor: s.color }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`relative w-full rounded-full bg-slate-100 ${trackClass}`}>
                  <div className="absolute inset-0 flex overflow-hidden rounded-full">
                    {series.map((s) => {
                      const v = Number(r[s.key]) || 0;
                      if (v <= 0) return null;
                      return (
                        <div
                          key={s.key}
                          role={onSegmentClick ? "button" : undefined}
                          onClick={
                            onSegmentClick
                              ? (e) => {
                                  e.stopPropagation();
                                  onSegmentClick(r, s.key);
                                }
                              : undefined
                          }
                          className={`h-full ${onSegmentClick ? "cursor-pointer transition-opacity hover:opacity-75" : ""}`}
                          style={{ width: pct(v), backgroundColor: getColor && !segments ? getColor(r) : s.color }}
                        />
                      );
                    })}
                  </div>
                  {reference && (
                    <div
                      className="absolute -bottom-1 -top-1 border-l-2 border-dashed"
                      style={{ left: pct(reference.value), borderColor: reference.color ?? "#64748b" }}
                    />
                  )}
                </div>
              )}
            </Hover>
          );
        })}
      </div>
    </div>
  );
}
