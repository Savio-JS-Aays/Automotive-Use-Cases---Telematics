import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

const subline = (t) => [t.model_label, t.region_name].filter(Boolean).join(" · ");

/**
 * Searchable picker to jump between trucks while in Asset View.
 * `trucks` rows: { vehicle_id, vin, model_label, region_name, application_name }.
 * Search matches VIN, vehicle ID, model, region and application; every word must match.
 */
export default function TruckSwitcher({ trucks, selectedId, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const current = trucks.find((t) => t.vehicle_id === selectedId) ?? null;

  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return trucks;
    return trucks.filter((t) => {
      const hay = `${t.vin} ${t.vehicle_id} ${t.model_label} ${t.region_name} ${t.application_name}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [trucks, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const openList = () => {
    const at = trucks.findIndex((t) => t.vehicle_id === selectedId);
    setCursor(Math.max(0, at));
    setOpen(true);
  };

  const choose = (truck) => {
    if (truck && truck.vehicle_id !== selectedId) onSelect(truck.vehicle_id);
    close();
  };

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(matches.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(matches[cursor]);
    }
  };

  return (
    <div ref={rootRef} className="relative mb-4">
      <button
        type="button"
        onClick={() => (open ? close() : openList())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-sky-200 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-sky-900">{current?.vin ?? selectedId}</span>
          {current && <span className="block truncate text-[11px] text-slate-500">{subline(current)}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-sky-600 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-4 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="VIN, model, region…"
              aria-label="Search trucks"
              className="w-full rounded border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 ? (
              <li className="px-3 py-3 text-xs text-slate-400">No truck matches "{query}".</li>
            ) : (
              matches.map((t, i) => (
                <li
                  key={t.vehicle_id}
                  data-index={i}
                  role="option"
                  aria-selected={t.vehicle_id === selectedId}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(t)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 ${i === cursor ? "bg-sky-50" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-800">{t.vin}</span>
                    <span className="block truncate text-[11px] text-slate-500">{subline(t)}</span>
                  </span>
                  {t.vehicle_id === selectedId && <Check className="h-3.5 w-3.5 shrink-0 text-sky-600" strokeWidth={2.5} />}
                </li>
              ))
            )}
          </ul>
          <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
            {matches.length === trucks.length ? `${trucks.length} connected trucks` : `${matches.length} of ${trucks.length} trucks`}
          </p>
        </div>
      )}
    </div>
  );
}
