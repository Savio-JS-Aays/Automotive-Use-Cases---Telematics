import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Clock, Gauge, IndianRupee, ShieldCheck, Sigma, Target } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import { usePartPrecursor } from "../../hooks/useReliabilityData";
import { GROUP_PALETTE, GROUP_TYPES, HAZARD_STYLES, formatKm, modeCounts, partFailureRows, precursorSignature, weibullPlot } from "./reliabilityMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatInr, formatNumber, formatPct } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, Pill, Segmented } from "../telematics/TelematicsUi";
import { HazardChart, SurvivalChart, WeibullPlot } from "./ReliabilityCharts";
import { VariancePill } from "./FieldLifeTab";

const VISIT_STYLES = {
  breakdown: "bg-rose-100 text-rose-700",
  repair: "bg-amber-100 text-amber-700",
  predicted: "bg-emerald-100 text-emerald-700",
};

// Charts hidden from the dashboard on request (2026-10-01); flip to true to restore.
const SHOW = { weibullPlot: false };

export default function PartView({ partId, raw, lt, summaries, loading, onBack, onOpenAsset }) {
  const [groupType, setGroupType] = useState("supplier");
  const summary = summaries.find((s) => s.partId === partId);
  const part = lt.partsById.get(partId);
  const weibull = useMemo(() => weibullPlot(lt, partId), [lt, partId]);
  const modes = useMemo(() => modeCounts(lt, partId), [lt, partId]);
  const failures = useMemo(() => partFailureRows(lt, partId), [lt, partId]);
  const vehicleIds = useMemo(() => raw.vehicles.map((v) => v.vehicle_id), [raw.vehicles]);
  const precursor = usePartPrecursor(partId, vehicleIds);
  const signature = useMemo(() => precursorSignature(precursor.rows), [precursor.rows]);

  const columns = [
    { key: "vin", label: "VIN", render: (r) => <span className="font-medium text-slate-700 group-hover:text-sky-700">{r.vin}</span>, sortValue: (r) => r.vin, csv: (r) => r.vin, className: "" },
    { key: "model", label: "Model", render: (r) => r.modelLabel ?? "—", sortValue: (r) => r.modelLabel, csv: (r) => r.modelLabel },
    { key: "date", label: "Date", render: (r) => format(parseISO(r.date), "d MMM yyyy"), sortValue: (r) => r.date, csv: (r) => r.date },
    { key: "odo", label: "Odometer", align: "right", render: (r) => `${formatNumber(r.odometer)} km`, sortValue: (r) => r.odometer, csv: (r) => Math.round(r.odometer) },
    { key: "life", label: "Part life", align: "right", render: (r) => formatKm(r.life), sortValue: (r) => r.life, csv: (r) => Math.round(r.life) },
    { key: "supplier", label: "Supplier", render: (r) => r.supplierName, sortValue: (r) => r.supplierName, csv: (r) => r.supplierName },
    { key: "mode", label: "Failure mode", render: (r) => r.mode ?? "—", sortValue: (r) => r.mode, csv: (r) => r.mode },
    { key: "visit", label: "Visit", render: (r) => <Pill className={VISIT_STYLES[r.visitType] ?? "bg-slate-100 text-slate-600"}>{r.visitType}</Pill>, sortValue: (r) => r.visitType, csv: (r) => r.visitType },
    { key: "flags", label: "", render: (r) => <span className="text-[11px] text-slate-400">{[r.repeat && "repeat", r.inWarranty && "warranty"].filter(Boolean).join(" · ")}</span>, csv: (r) => [r.repeat && "repeat", r.inWarranty && "warranty"].filter(Boolean).join(" ") },
  ];

  if (!loading && !summary) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-sky-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <EmptyChart message={`${part?.part_name ?? partId} has no replacements for the trucks in scope.`} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-800">{part?.part_name ?? partId}</h2>
              {summary && <Pill className={HAZARD_STYLES[summary.status]}>{summary.status}</Pill>}
              {summary && <VariancePill value={summary.variancePct} />}
            </div>
            <p className="text-xs text-slate-500">
              {partId} · {part?.part_type} · {part?.vehicle_subsystem} · design B10 {formatKm(summary?.designKm)} · unit cost {formatInr(part?.unit_cost)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          title="Field B10"
          value={formatKm(summary?.fieldB10)}
          subtitle={summary?.extrapolated ? "extrapolated from Weibull" : "Kaplan–Meier"}
          icon={Target}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip="km of part life at which 10 % of parts have failed (running parts censored)."
        />
        <KpiCard
          title="Weibull Shape / Life"
          value={summary?.fit ? `${summary.fit.beta.toFixed(2)} / ${formatKm(summary.fit.eta)}` : "—"}
          subtitle={summary?.pattern ?? "fewer than 10 failures"}
          icon={Sigma}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="Shape β (below 1 infant mortality, about 1 random, above 1 wear-out) and characteristic life η (63 % failed)."
        />
        <KpiCard
          title="Failures / Running"
          value={`${formatNumber(summary?.failures)} / ${formatNumber(summary?.suspensions)}`}
          subtitle={`${formatNumber(summary?.ratePer100k, 3)} per 100k km`}
          icon={Gauge}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="Replacements vs parts still running (censored). Rate = failures ÷ km of part life × 100,000."
        />
        <KpiCard
          title="Predicted"
          value={formatPct(summary?.predictedPct)}
          subtitle={`${formatPct(summary?.repeatPct, 1)} repeat repairs`}
          icon={ShieldCheck}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Share of this part's replacements done on a predicted visit; repeat = same truck within 10,000 km or 30 days."
        />
        <KpiCard
          title="Downtime per Failure"
          value={summary?.meanDowntime !== null && summary?.meanDowntime !== undefined ? `${formatNumber(summary.meanDowntime, 1)} h` : "—"}
          icon={Clock}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip="Mean workshop downtime of the repair orders that replaced this part."
        />
        <KpiCard
          title="Parts Cost per Failure"
          value={formatInr(summary?.meanCost)}
          icon={IndianRupee}
          iconBgClass="bg-slate-100"
          iconColorClass="text-slate-600"
          loading={loading}
          tooltip="Mean part cost (INR) per replacement, excluding labour."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {SHOW.weibullPlot && (
        <ChartCard
          title="Weibull Probability Plot"
          tooltip="Cumulative share failed (F) against km of part life on Weibull paper: a straight line means the Weibull model fits, its slope is β. One series per supplier with at least 5 failures (fit line from 10). A supplier line left of the others fails earlier; the green line is the design B10."
        >
          {loading ? <ChartSkeleton height="h-80" /> : <WeibullPlot groups={weibull} designKm={summary?.designKm} height={320} />}
        </ChartCard>
        )}

        <ChartCard
          className={SHOW.weibullPlot ? "" : "xl:col-span-2"}
          title="Survival by Group"
          tooltip="Kaplan–Meier survival of this part split by supplier, model or application (groups with at least 5 failures, top 5). Parts still running are censored at their current km."
          actions={<Segmented value={groupType} onChange={setGroupType} options={GROUP_TYPES} size="xs" />}
        >
          {loading ? <ChartSkeleton height="h-80" /> : <SurvivalChart lt={lt} partId={partId} groupType={groupType} designKm={summary?.designKm} height={320} />}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Failure Modes" tooltip="How this part failed, from the workshop's failure-mode code.">
          {loading ? (
            <ChartSkeleton />
          ) : modes.length === 0 ? (
            <EmptyChart message="No failures." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart layout="vertical" data={modes} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="category" dataKey="mode" width={120} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <RechartsTooltip formatter={(v) => [v, "Failures"]} />
                <Bar dataKey="count" fill="#0ea5e9" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Hazard Rate by km" tooltip="Failures per 1,000 parts at risk in each 50,000 km band of part life. Rising = wear-out (an interval replacement can pay off); falling = early-life quality problem.">
          {loading ? <ChartSkeleton /> : <HazardChart lt={lt} partId={partId} />}
        </ChartCard>

        <ChartCard
          title="Precursor Signature"
          tooltip="Mean |z-score| of the signals that ramp most before this part fails, aligned on the failure day (x = days before replacement). Only failures inside the telemetry window count. A rising line is an early warning a predictive model can use."
        >
          {precursor.loading || loading ? (
            <ChartSkeleton />
          ) : precursor.error ? (
            <EmptyChart message={`Couldn't load precursor data: ${precursor.error.message}`} />
          ) : signature.signals.length === 0 ? (
            <EmptyChart message="No failures of this part inside the telemetry window." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={signature.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="day" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} tickFormatter={(d) => `${d}d`} />
                  <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={32} />
                  <RechartsTooltip labelFormatter={(d) => `${-d} days before failure`} formatter={(v, name) => [v === null ? "—" : v, `${name} mean |z|`]} />
                  <Legend verticalAlign="bottom" height={56} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                  {signature.signals.map((s, i) => (
                    <Line key={s.signal} type="monotone" dataKey={s.signal} name={`${s.signal} (${s.ramp.toFixed(1)}×)`} stroke={GROUP_PALETTE[i % GROUP_PALETTE.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[11px] text-slate-400">{signature.failures} failures with telemetry in the 30 days before.</p>
            </>
          )}
        </ChartCard>
      </div>

      <DataTable
        title="Replacements"
        tooltip="Every replacement of this part on the trucks in scope. Part life = km since the part was fitted. Click a row to open the truck in Vehicle Diagnostics."
        columns={columns}
        rows={failures}
        rowKey={(r) => r.replacementId}
        onRowClick={(r) => onOpenAsset(r.vehicleId)}
        loading={loading}
        emptyMessage="No replacements."
        searchPlaceholder="Search VIN, supplier, mode…"
        searchText={(r) => `${r.vin} ${r.supplierName} ${r.mode} ${r.modelLabel}`}
        initialSort={{ key: "date", dir: "desc" }}
        csvName={`replacements-${partId}.csv`}
      />
    </div>
  );
}
