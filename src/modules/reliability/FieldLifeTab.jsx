import React, { useMemo, useState } from "react";
import { Clock, Gauge, Repeat, ShieldCheck, Target, TrendingDown } from "lucide-react";
import { CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip as RechartsTooltip, XAxis, YAxis, ZAxis } from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import { GROUP_TYPES, HAZARD_COLORS, HAZARD_STATUSES, HAZARD_STYLES, MIN_WEIBULL_FAILURES, failurePatternMap, formatKm, reliabilityKpis } from "./reliabilityMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatNumber, formatPct } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, LocalSelect, Pill, Segmented } from "../telematics/TelematicsUi";
import { HazardChart, SurvivalChart } from "./ReliabilityCharts";


function PatternTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="font-semibold text-slate-700">{p.label}</p>
      <p className="text-slate-500">
        β {p.y.toFixed(2)} ({p.pattern}) · η {formatKm(p.x)}
      </p>
      <p className="text-slate-500">
        {p.z} failures · B10 {p.variancePct !== null ? `${p.variancePct > 0 ? "+" : ""}${p.variancePct.toFixed(0)}% vs design` : "—"}
      </p>
      <p className="text-[10px] text-slate-400">Click to open the part</p>
    </div>
  );
}

export function VariancePill({ value }) {
  if (value === null || value === undefined) return <span className="text-slate-300">—</span>;
  return <Pill className={value < 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}>{`${value > 0 ? "+" : ""}${value.toFixed(0)}%`}</Pill>;
}

// Charts hidden from the dashboard on request (2026-10-01); flip to true to restore.
const SHOW = { failurePatternMap: false, survivalCurve: false };

export default function FieldLifeTab({ lt, summaries, loading, onOpenPart }) {
  const kpis = useMemo(() => reliabilityKpis(lt, summaries), [lt, summaries]);
  const pattern = useMemo(() => failurePatternMap(summaries), [summaries]);
  const [partChoice, setPartChoice] = useState(null);
  const [groupType, setGroupType] = useState("all");
  const partId = partChoice && summaries.some((s) => s.partId === partChoice) ? partChoice : summaries[0]?.partId ?? null;
  const selected = summaries.find((s) => s.partId === partId);
  const partOptions = summaries.map((s) => ({ value: s.partId, label: `${s.partName} (${s.failures})` }));

  const columns = [
    { key: "part", label: "Component", render: (r) => <span className="font-medium text-slate-700 group-hover:text-sky-700">{r.partName}</span>, sortValue: (r) => r.partName, csv: (r) => r.partName, className: "" },
    { key: "type", label: "Type", render: (r) => `${r.partType ?? "—"} · ${r.subsystem ?? ""}`, sortValue: (r) => r.partType, csv: (r) => r.partType },
    { key: "n", label: "Failures", align: "right", render: (r) => formatNumber(r.failures), sortValue: (r) => r.failures, csv: (r) => r.failures },
    { key: "susp", label: "Running", align: "right", render: (r) => formatNumber(r.suspensions), sortValue: (r) => r.suspensions, csv: (r) => Math.round(r.suspensions) },
    { key: "beta", label: "Beta (β)", align: "right", render: (r) => (r.beta !== null ? r.beta.toFixed(2) : "—"), sortValue: (r) => r.beta, csv: (r) => r.beta?.toFixed(3) ?? "" },
    { key: "eta", label: "Eta (η)", align: "right", render: (r) => formatKm(r.eta), sortValue: (r) => r.eta, csv: (r) => (r.eta ? Math.round(r.eta) : "") },
    {
      key: "b10",
      label: "Field B10",
      align: "right",
      render: (r) => (
        <span>
          {formatKm(r.fieldB10)}
          {r.extrapolated && <span className="ml-1 text-[10px] text-slate-400">ext.</span>}
        </span>
      ),
      sortValue: (r) => r.fieldB10,
      csv: (r) => (r.fieldB10 ? Math.round(r.fieldB10) : ""),
    },
    { key: "design", label: "Design B10", align: "right", render: (r) => formatKm(r.designKm), sortValue: (r) => r.designKm, csv: (r) => (r.designKm ? Math.round(r.designKm) : "") },
    { key: "var", label: "Variance", render: (r) => <VariancePill value={r.variancePct} />, sortValue: (r) => r.variancePct, csv: (r) => r.variancePct?.toFixed(1) ?? "" },
    { key: "rate", label: "per 100k km", align: "right", render: (r) => formatNumber(r.ratePer100k, 3), sortValue: (r) => r.ratePer100k, csv: (r) => r.ratePer100k?.toFixed(4) ?? "" },
    { key: "status", label: "Hazard status", render: (r) => <Pill className={HAZARD_STYLES[r.status]}>{r.status}</Pill>, sortValue: (r) => HAZARD_STATUSES.indexOf(r.status), csv: (r) => r.status },
  ];

  const statusGroups = HAZARD_STATUSES.map((status) => ({ status, points: pattern.filter((p) => p.status === status) })).filter((g) => g.points.length);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          title="Parts Below Design B10"
          value={`${kpis.partsBelowDesign} / ${kpis.partsRated}`}
          subtitle="parts with at least 5 failures"
          icon={Target}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip="Components whose field B10 life (km at which 10 % of parts have failed, Kaplan–Meier with running parts censored) is shorter than the engineering design B10."
        />
        <KpiCard
          title="Worst Supplier Variance"
          value={kpis.worst ? <span className="text-rose-600">{`${kpis.worst.variancePct.toFixed(0)}%`}</span> : "—"}
          subtitle={kpis.worst ? `${kpis.worst.partName} · ${kpis.worst.supplierName} (n = ${kpis.worst.failures})` : undefined}
          icon={TrendingDown}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip="The part × supplier combination (at least 5 failures) whose field B10 falls furthest below the design B10. The first place to open a supplier quality case."
          onClick={kpis.worst ? () => onOpenPart(kpis.worst.partId) : undefined}
        />
        <KpiCard
          title="Fleet MTBF"
          value={formatKm(kpis.fleetMtbf)}
          subtitle={`${formatNumber(kpis.failures)} replacements`}
          icon={Gauge}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="Mean km between part failures per truck: total km driven by the trucks in scope ÷ unplanned part replacements."
        />
        <KpiCard
          title="Predicted Before Failure"
          value={formatPct(kpis.predictedPct)}
          icon={ShieldCheck}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Share of replacements done on a predicted (planned-in-advance) visit rather than after a breakdown or a reactive repair. History before telematics has no predictions, so this rises over time."
        />
        <KpiCard
          title="Downtime per Failure"
          value={kpis.meanDowntime !== null ? `${formatNumber(kpis.meanDowntime, 1)} h` : "—"}
          icon={Clock}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="Mean workshop downtime of the repair order behind each replacement."
        />
        <KpiCard
          title="Repeat Repairs"
          value={formatPct(kpis.repeatPct, 2)}
          icon={Repeat}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip="Replacements of the same part on the same truck within 10,000 km or 30 days of the previous one: a sign of misdiagnosis or bad fitment."
        />
      </div>

      {(SHOW.failurePatternMap || SHOW.survivalCurve) && (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {SHOW.failurePatternMap && (
        <ChartCard
          title="Failure-Pattern Map (β × η)"
          tooltip={`Each bubble is a part with at least ${MIN_WEIBULL_FAILURES} failures. y = Weibull shape β: below 1 = infant mortality (manufacturing / fitment quality), about 1 = random, above 1 = wear-out. x = characteristic life η (63 % failed). Bubble size = failures, colour = B10 vs design. Bottom-left parts fail early for quality reasons; top-left wear out early.`}
        >
          {loading ? (
            <ChartSkeleton height="h-80" />
          ) : pattern.length === 0 ? (
            <EmptyChart height="h-80" message="No part has enough failures for a Weibull fit." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" dataKey="x" scale="log" domain={["auto", "auto"]} tickFormatter={formatKm} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} name="η" />
                <YAxis type="number" dataKey="y" domain={[0, "auto"]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={36} name="β" />
                <ZAxis type="number" dataKey="z" range={[40, 500]} />
                <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: "β = 1 (random)", fontSize: 10, fill: "#64748b", position: "insideBottomRight" }} />
                <RechartsTooltip content={<PatternTooltip />} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                {statusGroups.map((g) => (
                  <Scatter key={g.status} name={g.status} data={g.points} fill={HAZARD_COLORS[g.status]} fillOpacity={0.7} onClick={(p) => onOpenPart(p.partId ?? p.payload?.partId)} className="cursor-pointer" />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        )}

        {SHOW.survivalCurve && (
        <ChartCard
          className={SHOW.failurePatternMap ? "" : "xl:col-span-2"}
          title="Survival Curve (Kaplan–Meier)"
          tooltip="Share of parts still running against km since fitted. Parts that have not failed yet are censored at their current km, so the curve is not biased towards early failures. Shaded = 90 % confidence band (single group). Where the curve crosses 90 % is the field B10."
          actions={
            <>
              <LocalSelect label="Part" value={partId ?? ""} onChange={setPartChoice} options={partOptions} />
              <Segmented value={groupType} onChange={setGroupType} options={GROUP_TYPES} size="xs" />
            </>
          }
        >
          {loading ? <ChartSkeleton height="h-80" /> : partId ? <SurvivalChart lt={lt} partId={partId} groupType={groupType} designKm={selected?.designKm} height={300} /> : <EmptyChart message="No failures." />}
        </ChartCard>
        )}
      </div>
      )}

      <ChartCard
        title={`Hazard Rate by km${selected ? ` · ${selected.partName}` : ""}`}
        tooltip="Failures per 1,000 parts at risk in each 50,000 km band of part life (actuarial estimate). Falling = infant mortality, flat = random, rising = wear-out: tells you whether a fixed replacement interval makes sense."
        actions={SHOW.survivalCurve ? null : <LocalSelect label="Part" value={partId ?? ""} onChange={setPartChoice} options={partOptions} />}
      >
        {loading ? <ChartSkeleton /> : partId ? <HazardChart lt={lt} partId={partId} /> : <EmptyChart message="No failures." />}
      </ChartCard>

      <DataTable
        title="Component Variance Master"
        tooltip="Every component with at least one replacement. Field B10 = Kaplan–Meier km at 90 % survival ('ext.' = extrapolated from the Weibull fit because fewer than 10 % have failed). Variance = field ÷ design − 1. Hazard: Critical below −20 %, Watch below 0, Insufficient Data under 5 failures. Click a row for the Part View."
        columns={columns}
        rows={summaries}
        rowKey={(r) => r.partId}
        onRowClick={(r) => onOpenPart(r.partId)}
        loading={loading}
        emptyMessage="No part replacements for the trucks in scope."
        searchPlaceholder="Search component…"
        searchText={(r) => `${r.partName} ${r.partType} ${r.subsystem}`}
        initialSort={{ key: "var", dir: "asc" }}
        csvName="component-variance-master.csv"
      />
    </div>
  );
}
