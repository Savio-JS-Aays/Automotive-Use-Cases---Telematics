import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { MIN_PRECURSOR_FAILURES, MODE_PALETTE, dtcConfirmation, failureModeMix, precursorMatrix } from "./reliabilityMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatNumber, formatPct } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, HeatGrid, Pill, SingleLineTick } from "../telematics/TelematicsUi";

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
  const modes = useMemo(() => failureModeMix(lt, summaries), [lt, summaries]);
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
          title="Failure-Mode Mix (Top 10 Parts)"
          tooltip="How each of the most-replaced components failed, from the workshop's failure-mode code. One dominant mode (for example seal leak) gives the supplier a concrete corrective-action target. Click a bar for the Part View."
        >
          {loading ? (
            <ChartSkeleton height="h-96" />
          ) : modes.rows.length === 0 ? (
            <EmptyChart height="h-96" message="No failures." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, modes.rows.length * 32 + 70)}>
              <BarChart layout="vertical" data={modes.rows} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="category" dataKey="label" width={170} interval={0} tick={<SingleLineTick max={28} />} axisLine={AXIS_LINE} tickLine={false} />
                <RechartsTooltip />
                <Legend verticalAlign="bottom" height={48} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                {modes.modes.map((m, i) => (
                  <Bar key={m} dataKey={m} stackId="mode" fill={MODE_PALETTE[i % MODE_PALETTE.length]} onClick={(d) => onOpenPart(d.partId ?? d.payload?.partId)} className="cursor-pointer" />
                ))}
              </BarChart>
            </ResponsiveContainer>
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
