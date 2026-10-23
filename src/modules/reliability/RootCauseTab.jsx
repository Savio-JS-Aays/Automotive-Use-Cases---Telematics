import React, { useMemo, useState } from "react";
import { CLEAR_CAUSE_SHARE, MIN_PRECURSOR_FAILURES, dtcConfirmation, mainCauses, precursorMatrix } from "./reliabilityMetrics";
import { formatNumber, formatPct } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, HeatGrid, LocalSelect, Pill, Segmented } from "../telematics/TelematicsUi";

const SHORT_SIGNAL = {
  AIR_PRESSURE: "Air P",
  BATTERY_VOLTAGE: "24V batt",
  BOOST_PRESSURE: "Boost",
  BRAKE_LINING_REMAINING: "Brake lining",
  COOLANT_TEMP: "Coolant",
  DPF_DIFF_PRESSURE: "DPF ΔP",
  DPF_SOOT_LOAD: "DPF soot",
  FUEL_RAIL_PRESSURE: "Rail P",
  HV_BATTERY_TEMP: "HV temp",
  HV_SOH: "HV SoH",
  OIL_PRESSURE: "Oil P",
  SCR_EFFICIENCY: "SCR eff",
  TYRE_PRESSURE: "Tyre P",
};

function GapPill({ gap }) {
  if (gap === null) return <span className="text-slate-300">—</span>;
  const big = Math.abs(gap) >= 20;
  return <Pill className={big ? (gap < 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700") : "bg-emerald-50 text-emerald-700"}>{`${gap > 0 ? "+" : ""}${gap.toFixed(0)} pp`}</Pill>;
}

const PAGE_SIZE = 10;

/** Prev / next pager with "x–y of n". */
function Pager({ page, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const btn = "rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 enabled:hover:bg-slate-50 disabled:opacity-40";
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>
          ← Prev
        </button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}

const searchBox = "w-40 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none";

export default function RootCauseTab({ raw, lt, summaries, loading, onOpenPart }) {
  const causes = useMemo(() => mainCauses(lt, summaries, Infinity), [lt, summaries]);
  const precursor = useMemo(() => precursorMatrix(raw, lt), [raw, lt]);

  // Main Failure Cause: search, subsystem, clear-target filter, sort, pages of 10
  const [causeQ, setCauseQ] = useState("");
  const [causeSub, setCauseSub] = useState("all");
  const [causeClear, setCauseClear] = useState("all");
  const [causeSort, setCauseSort] = useState("failures");
  const [causePage, setCausePage] = useState(0);
  const subsystemOptions = (rows) => [
    { value: "all", label: "All subsystems" },
    ...[...new Set(rows.map((r) => r.subsystem).filter(Boolean))].sort().map((v) => ({ value: v, label: v })),
  ];
  const causeRows = useMemo(() => {
    const q = causeQ.trim().toLowerCase();
    const rows = causes.rows.filter(
      (r) =>
        (!q || `${r.partName} ${r.main?.mode ?? ""}`.toLowerCase().includes(q)) &&
        (causeSub === "all" || r.subsystem === causeSub) &&
        (causeClear === "all" || (causeClear === "clear" ? r.clear : !r.clear))
    );
    return causeSort === "share" ? [...rows].sort((a, b) => (b.main?.share ?? 0) - (a.main?.share ?? 0) || b.failures - a.failures) : rows;
  }, [causes.rows, causeQ, causeSub, causeClear, causeSort]);
  const causePageRows = causeRows.slice(causePage * PAGE_SIZE, (causePage + 1) * PAGE_SIZE);
  const resetCause = (fn) => (v) => {
    fn(v);
    setCausePage(0);
  };

  // Precursor Ramp: search, subsystem, signal, minimum ramp, pages of 10
  const [preQ, setPreQ] = useState("");
  const [preSub, setPreSub] = useState("all");
  const [preSignal, setPreSignal] = useState("all");
  const [preMin, setPreMin] = useState("0");
  const preCols = useMemo(() => (preSignal === "all" ? precursor.cols : precursor.cols.filter((c) => c.id === preSignal)), [precursor.cols, preSignal]);
  const preRows = useMemo(() => {
    const q = preQ.trim().toLowerCase();
    const min = Number(preMin);
    return precursor.rows.filter((r) => {
      if (q && !r.label.toLowerCase().includes(q)) return false;
      if (preSub !== "all" && r.subsystem !== preSub) return false;
      if (min > 0) {
        const best = Math.max(0, ...preCols.map((c) => precursor.cells.get(`${r.id}|${c.id}`)?.ramp ?? 0));
        if (best < min) return false;
      }
      return true;
    });
  }, [precursor, preCols, preQ, preSub, preMin]);
  const prePageRows = preRows;
  const resetPre = (fn) => (v) => fn(v);
  const confirmation = useMemo(() => dtcConfirmation(raw, lt), [raw, lt]);

  const columns = [
    {
      key: "dtc",
      label: "Fault code",
      render: (r) => (
        <div>
          <p className="font-medium text-slate-700">{r.dtcLabel}</p>
          <p className="text-[11px] text-slate-400">{r.dtcId}</p>
        </div>
      ),
      sortValue: (r) => r.dtcId,
      csv: (r) => `${r.dtcId} ${r.dtcLabel}`,
      className: "",
    },
    { key: "part", label: "Linked part", render: (r) => <span className="text-slate-700 group-hover:text-sky-700">{r.partName}</span>, sortValue: (r) => r.partName, csv: (r) => r.partName },
    { key: "likelihood", label: "Catalog likelihood", align: "right", render: (r) => formatPct(r.likelihood, 0), sortValue: (r) => r.likelihood, csv: (r) => r.likelihood.toFixed(0) },
    { key: "observed", label: "Observed", align: "right", render: (r) => formatPct(r.observed, 0), sortValue: (r) => r.observed, csv: (r) => r.observed?.toFixed(0) ?? "" },
    { key: "n", label: "Resolved codes", align: "right", render: (r) => `${r.hits} / ${r.resolved}`, sortValue: (r) => r.resolved, csv: (r) => r.resolved },
    { key: "gap", label: "Gap", render: (r) => <GapPill gap={r.gap} />, sortValue: (r) => (r.gap === null ? null : Math.abs(r.gap)), csv: (r) => r.gap?.toFixed(0) ?? "" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <ChartCard
          title="Main Failure Cause by Part"
          subtitle={`${causeRows.length} of ${causes.rows.length} parts with failures`}
          actions={
            <>
              <input type="search" value={causeQ} onChange={(e) => resetCause(setCauseQ)(e.target.value)} placeholder="Search part or mode" className={searchBox} />
              <LocalSelect label="" value={causeSub} onChange={resetCause(setCauseSub)} options={subsystemOptions(causes.rows)} />
              <LocalSelect
                label=""
                value={causeClear}
                onChange={resetCause(setCauseClear)}
                options={[
                  { value: "all", label: "All parts" },
                  { value: "clear", label: "Clear target only" },
                  { value: "mixed", label: "Mixed causes only" },
                ]}
              />
              <Segmented
                size="xs"
                value={causeSort}
                onChange={resetCause(setCauseSort)}
                options={[
                  { value: "failures", label: "By failures" },
                  { value: "share", label: "By main-cause share" },
                ]}
              />
            </>
          }
          tooltip={`Every part with failures, ranked by failures (or by how dominant its main cause is), 10 per page. Under each part: the failure mode that causes most of its failures, from the workshop's failure-mode code. When one mode is ${CLEAR_CAUSE_SHARE} % or more of a part's failures it is flagged "Clear target": a concrete corrective action for the supplier or design team. Hover a row for every mode. Click a row for the Part View.`}
        >
          {loading ? (
            <ChartSkeleton height="h-96" />
          ) : causeRows.length === 0 ? (
            <EmptyChart height="h-96" message={causes.rows.length === 0 ? "No failures." : "No part matches these filters."} />
          ) : (
            <>
              <ul className="space-y-3">
                {causePageRows.map((r) => (
                  <li key={r.partId}>
                    <button
                      type="button"
                      onClick={() => onOpenPart(r.partId)}
                      title={r.modes.map((m) => `${m.mode}: ${m.count} (${m.share.toFixed(0)}%)`).join("\n")}
                      className="group w-full rounded-md px-1 py-0.5 text-left hover:bg-sky-50"
                    >
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-slate-700 group-hover:text-sky-700">{r.partName}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">{r.failures} failures</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded bg-slate-100">
                        <div className="h-1.5 rounded bg-sky-500" style={{ width: `${(r.failures / causes.max) * 100}%` }} />
                      </div>
                      {r.main && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                          <span>
                            Mostly <span className={r.clear ? "font-semibold text-slate-800" : "text-slate-700"}>{r.main.mode}</span> ({r.main.share.toFixed(0)}%)
                          </span>
                          {r.clear ? (
                            <Pill className="bg-amber-50 text-amber-700">Clear target</Pill>
                          ) : (
                            r.second && <span className="text-slate-400">then {r.second.mode} ({r.second.share.toFixed(0)}%)</span>
                          )}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <Pager page={causePage} total={causeRows.length} onPage={setCausePage} />
              <p className="mt-2 text-[11px] text-slate-400">
                {causes.clearCount} of {causes.rows.length} parts have a clear target (one mode ≥ {CLEAR_CAUSE_SHARE}% of the part's failures, at least 5 failures).
              </p>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Precursor Ramp (Part × Signal)"
          subtitle={`${preRows.length} of ${precursor.rows.length} parts with ≥ ${MIN_PRECURSOR_FAILURES} failures inside the telemetry window`}
          actions={
            <>
              <input type="search" value={preQ} onChange={(e) => resetPre(setPreQ)(e.target.value)} placeholder="Search part" className={searchBox} />
              <LocalSelect label="" value={preSub} onChange={resetPre(setPreSub)} options={subsystemOptions(precursor.rows)} />
              <LocalSelect
                label=""
                value={preSignal}
                onChange={resetPre(setPreSignal)}
                options={[{ value: "all", label: "All signals" }, ...precursor.cols.map((c) => ({ value: c.id, label: SHORT_SIGNAL[c.id] ?? c.id }))]}
              />
              <LocalSelect
                label=""
                value={preMin}
                onChange={resetPre(setPreMin)}
                options={[
                  { value: "0", label: "Any ramp" },
                  { value: "1.5", label: "Ramp ≥ 1.5×" },
                  { value: "2", label: "Ramp ≥ 2×" },
                  { value: "3", label: "Ramp ≥ 3×" },
                ]}
              />
            </>
          }
          tooltip={`For failures inside the telemetry window: mean |z-score| of each signal in the 7 days before the replacement ÷ the same 21–30 days before. Above 1× = the signal drifted towards the failure, i.e. a usable early-warning signal for that part. Cells need at least ${MIN_PRECURSOR_FAILURES} failures. Click a cell to open the part.`}
        >
          {loading ? (
            <ChartSkeleton height="h-96" />
          ) : prePageRows.length === 0 ? (
            <EmptyChart height="h-96" message={precursor.rows.length === 0 ? "Not enough failures inside the telemetry window." : "No part matches these filters."} />
          ) : (
            <>
              <HeatGrid
                rows={prePageRows.map((r) => ({ ...r, label: `${r.label} (${r.failures})` }))}
                cols={preCols}
                colLabel={(c) => SHORT_SIGNAL[c.id] ?? c.id}
                max={precursor.max}
                rgb="225, 29, 72"
                rowLabelWidth={170}
                minColWidth={52}
                cellHeight="h-9"
                gapClass="gap-0.5"
                cellFor={(ri, ci) => {
                  const r = prePageRows[ri];
                  const c = preCols[ci];
                  const cell = precursor.cells.get(`${r.id}|${c.id}`);
                  if (cell.empty || cell.ramp === null) return { empty: true, title: `${r.label} · ${c.id}: not enough data` };
                  return {
                    value: Math.max(0, cell.ramp - 1),
                    display: `${cell.ramp.toFixed(1)}×`,
                    title: `${r.label} · ${c.id}: ramp ${cell.ramp.toFixed(2)}× (mean |z| ${cell.early.toFixed(2)} → ${cell.late.toFixed(2)}, ${cell.n} failures)`,
                    onClick: () => onOpenPart(r.id),
                  };
                }}
              />
              <p className="mt-2 text-[11px] text-slate-400">Row label shows failures with telemetry before them. Darker = stronger drift before failure. "Ramp ≥" keeps parts with at least one signal at or above it.</p>
            </>
          )}
        </ChartCard>
      </div>

      <DataTable
        title="Fault Code → Part Confirmation"
        tooltip="The fault catalog links each code to the parts that usually cause it, with a likelihood. Observed = share of that code's repaired occurrences where the repair order actually replaced the part. Large negative gaps mean the catalog sends technicians to the wrong part (wasted parts, No-Fault-Found claims); positive gaps mean the link is stronger than documented. Click a row for the Part View."
        columns={columns}
        rows={confirmation}
        rowKey={(r) => r.key}
        onRowClick={(r) => onOpenPart(r.partId)}
        loading={loading}
        emptyMessage="No repaired fault codes for the trucks in scope."
        searchPlaceholder="Search code or part…"
        searchText={(r) => `${r.dtcId} ${r.dtcLabel} ${r.partName}`}
        initialSort={{ key: "n", dir: "desc" }}
        csvName="dtc-part-confirmation.csv"
      />
      <p className="text-[11px] text-slate-400">{formatNumber(confirmation.length)} code → part links with at least one repaired occurrence.</p>
    </div>
  );
}
