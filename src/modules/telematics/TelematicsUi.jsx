import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Search, X } from "lucide-react";
import ChartHeader from "../../components/ui/ChartHeader";
import { downloadCsv, truncateString } from "./telematicsFormat";

export function ChartCard({ title, tooltip, badge, actions, className = "", children }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <ChartHeader title={title} tooltip={tooltip} />
          {badge && (
            <span
              className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${
                badge === "NOW" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {actions && <div className="mb-3 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Y-axis category tick on one line (Recharts wraps long labels otherwise), truncated to `max`. */
export function SingleLineTick({ x, y, payload, max = 34 }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="#64748b">
      <title>{payload.value}</title>
      {truncateString(String(payload.value ?? ""), max)}
    </text>
  );
}

export function ChartSkeleton({ height = "h-64" }) {
  return <div className={`${height} w-full animate-pulse rounded bg-slate-50`} />;
}

export function EmptyChart({ message, height = "h-64" }) {
  return <div className={`flex ${height} items-center justify-center text-sm text-slate-400`}>{message}</div>;
}

export function Pill({ className, children }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

/** Small toggle group used for local filters. */
export function Segmented({ value, onChange, options, size = "sm" }) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
      {options.map((opt) => {
        const o = typeof opt === "string" ? { value: opt, label: opt } : opt;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded px-2.5 ${size === "xs" ? "py-0.5 text-[11px]" : "py-1 text-xs"} font-medium transition-colors ${
              value === o.value ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function LocalSelect({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterChips({ chips, onRemove, onClear }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-white">
          {chip.label}
          <button type="button" aria-label={`Remove ${chip.label}`} onClick={() => onRemove(chip.key)}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={onClear} className="text-xs text-slate-500 underline-offset-2 hover:underline">
          Clear all
        </button>
      )}
    </div>
  );
}

/**
 * Generic heat grid (rows × cols). `cellFor(rowIdx, colIdx)` returns
 * { value, display, sub, title, empty, muted, onClick }. Colour intensity = value / max.
 */
export function HeatGrid({
  rows,
  cols,
  cellFor,
  max,
  rgb = "225, 29, 72",
  rowLabelWidth = 64,
  cellHeight = "h-12",
  minColWidth = 56,
  gapClass = "gap-1",
  colLabel = (c) => c.label,
}) {
  return (
    <div className="overflow-x-auto">
      <div
        className={`grid ${gapClass} text-xs`}
        style={{ gridTemplateColumns: `minmax(${rowLabelWidth}px, auto) repeat(${cols.length}, minmax(${minColWidth}px, 1fr))` }}
      >
        <div />
        {cols.map((c) => (
          <div key={c.id} className="px-1 pb-1 text-center font-medium leading-tight text-slate-500" title={c.label}>
            {colLabel(c)}
          </div>
        ))}
        {rows.map((r, ri) => (
          <React.Fragment key={r.id}>
            <div className="flex items-center pr-2 font-medium text-slate-600" title={r.label}>
              {truncateString(r.label, 20)}
            </div>
            {cols.map((c, ci) => {
              const cell = cellFor(ri, ci);
              if (cell.empty) return <div key={c.id} className={`${cellHeight} rounded bg-slate-50`} title={cell.title} />;
              const alpha = cell.muted || !max ? 0 : 0.08 + Math.min((cell.value ?? 0) / max, 1) * 0.82;
              const dark = alpha > 0.5;
              const Tag = cell.onClick ? "button" : "div";
              return (
                <Tag
                  key={c.id}
                  type={cell.onClick ? "button" : undefined}
                  onClick={cell.onClick}
                  title={cell.title}
                  className={`flex ${cellHeight} flex-col items-center justify-center rounded ${
                    cell.onClick ? "transition-transform hover:scale-[1.04]" : ""
                  } ${cell.muted ? "bg-slate-100 text-slate-400" : dark ? "text-white" : "text-slate-700"} ${
                    cell.selected ? "ring-2 ring-sky-500" : ""
                  }`}
                  style={cell.muted ? undefined : { backgroundColor: `rgba(${rgb}, ${alpha})` }}
                >
                  <span className="text-sm font-semibold">{cell.display}</span>
                  {cell.sub !== undefined && <span className="text-[10px] opacity-80">{cell.sub}</span>}
                </Tag>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * Sortable, searchable master table.
 * columns: [{ key, label, render(row), sortValue(row), csv(row), align, className }]
 */
export function DataTable({
  title,
  tooltip,
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  emptyMessage,
  searchPlaceholder,
  searchText,
  toolbar,
  initialSort,
  csvName,
  maxHeight = "max-h-[28rem]",
  tableRef,
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    let out = term && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(term)) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const dir = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = col.sortValue(a);
          const vb = col.sortValue(b);
          if (va === null || va === undefined) return 1;
          if (vb === null || vb === undefined) return -1;
          return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
        });
      }
    }
    return out;
  }, [rows, search, searchText, sort, columns]);

  const toggleSort = (col) => {
    if (!col.sortValue) return;
    setSort((prev) => (prev?.key === col.key ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: "desc" }));
  };

  return (
    <div ref={tableRef} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChartHeader title={title} tooltip={tooltip} />
          <div className="flex items-center gap-2">
            {searchText && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-56 rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>
            )}
            {csvName && (
              <button
                type="button"
                onClick={() => downloadCsv(csvName, columns.filter((c) => c.csv), visible)}
                disabled={loading || visible.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
            )}
          </div>
        </div>
        {toolbar}
      </div>

      <div className={`${maxHeight} overflow-auto`}>
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col)}
                  className={`whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 ${
                    col.sortValue ? "cursor-pointer select-none hover:text-slate-600" : ""
                  } ${col.align === "right" ? "text-right" : ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sort?.key === col.key &&
                      (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-4">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-50" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`group align-top transition-colors ${onRowClick ? "cursor-pointer hover:bg-sky-50" : ""}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${col.align === "right" ? "text-right tabular-nums" : ""} ${col.className ?? "text-slate-600"}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && visible.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-400">
          {visible.length} of {rows.length} rows
        </div>
      )}
    </div>
  );
}
