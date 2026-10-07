import React, { useMemo } from "react";
import { CLEAR_CAUSE_SHARE, MIN_PRECURSOR_FAILURES, dtcConfirmation, mainCauses, precursorMatrix } from "./reliabilityMetrics";
import { formatNumber, formatPct } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, HeatGrid, Pill } from "../telematics/TelematicsUi";

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

export default function RootCauseTab({ raw, lt, summaries, loading, onOpenPart }) {
  const causes = useMemo(() => mainCauses(lt, summaries), [lt, summaries]);
  const precursor = useMemo(() => precursorMatrix(raw, lt), [raw, lt]);
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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Main Failure Cause by Part"
          tooltip={`The ${causes.rows.length} most-replaced parts, ranked by failures. Under each part: the failure mode that causes most of its failures, from the workshop's failure-mode code. When one mode is ${CLEAR_CAUSE_SHARE} % or more of a part's failures it is flagged "Clear target": a concrete corrective action for the supplier or design team. Hover a row for every mode. Click a row for the Part View.`}
        >
          {loading ? (
            <ChartSkeleton height="h-96" />
          ) : causes.rows.length === 0 ? (
            <EmptyChart height="h-96" message="No failures." />
          ) : (
            <>
              <ul className="space-y-3">
                {causes.rows.map((r) => (
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
              <p className="mt-3 text-[11px] text-slate-400">
                Top {causes.rows.length} parts by failures · {causes.clearCount} with a clear target (one mode ≥ {CLEAR_CAUSE_SHARE}% of the part's failures).
              </p>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Precursor Ramp (Part × Signal)"
          tooltip={`For failures inside the telemetry window: mean |z-score| of each signal in the 7 days before the replacement ÷ the same 21–30 days before. Above 1× = the signal drifted towards the failure, i.e. a usable early-warning signal for that part. Cells need at least ${MIN_PRECURSOR_FAILURES} failures. Click a cell to open the part.`}
        >
          {loading ? (
            <ChartSkeleton height="h-96" />
          ) : precursor.rows.length === 0 ? (
            <EmptyChart height="h-96" message="Not enough failures inside the telemetry window." />
          ) : (
            <>
              <HeatGrid
                rows={precursor.rows.map((r) => ({ ...r, label: `${r.label} (${r.failures})` }))}
                cols={precursor.cols}
                colLabel={(c) => SHORT_SIGNAL[c.id] ?? c.id}
                max={precursor.max}
                rgb="225, 29, 72"
                rowLabelWidth={170}
                minColWidth={52}
                cellHeight="h-9"
                gapClass="gap-0.5"
                cellFor={(ri, ci) => {
                  const r = precursor.rows[ri];
                  const c = precursor.cols[ci];
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
              <p className="mt-2 text-[11px] text-slate-400">Row label shows failures with telemetry before them. Darker = stronger drift before failure.</p>
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
