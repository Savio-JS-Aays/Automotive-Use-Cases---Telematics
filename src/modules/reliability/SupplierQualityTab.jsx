import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { RISK_TIER_COLORS, cohortMatrix, formatKm, riskTierSummary, supplierScorecard, whereFails } from "./reliabilityMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, formatNumber, truncateString } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, EmptyChart, HeatGrid, Segmented, SingleLineTick } from "../telematics/TelematicsUi";

const WHERE_DIMS = [
  { value: "application", label: "Application" },
  { value: "region", label: "Region" },
  { value: "model", label: "Model" },
];

function TierLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-slate-500">
      {Object.entries(RISK_TIER_COLORS).map(([tier, color]) => (
        <span key={tier} className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {tier} risk
        </span>
      ))}
    </div>
  );
}

export default function SupplierQualityTab({ raw, lt, summaries, loading, onOpenPart }) {
  const [dim, setDim] = useState("application");
  const scorecard = useMemo(() => supplierScorecard(summaries), [summaries]);
  const tiers = useMemo(() => riskTierSummary(summaries), [summaries]);
  const cohorts = useMemo(() => cohortMatrix(lt, raw.latestDate), [lt, raw.latestDate]);
  const where = useMemo(() => whereFails(lt, summaries, dim), [lt, summaries, dim]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Supplier Scorecard: Field B10 as % of Design"
          tooltip="Field B10 life of each part × supplier combination (at least 5 failures) as a share of the design B10; the 15 worst are shown. Below 100 % = the supplier's parts reach 10 % failures earlier than engineering specified. Colour = supplier risk tier. Click a bar for the Part View."
          actions={<TierLegend />}
        >
          {loading ? (
            <ChartSkeleton height="h-96" />
          ) : scorecard.length === 0 ? (
            <EmptyChart height="h-96" message="No part × supplier group has 5 or more failures." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(240, scorecard.length * 26 + 40)}>
              <BarChart layout="vertical" data={scorecard} margin={{ left: 8, right: 56 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" domain={[0, (max) => Math.max(110, Math.ceil(max / 10) * 10)]} unit="%" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="category" dataKey="label" width={250} interval={0} tick={<SingleLineTick max={42} />} axisLine={AXIS_LINE} tickLine={false} />
                <ReferenceLine x={100} stroke="#10b981" strokeDasharray="4 3" label={{ value: "design", fontSize: 10, fill: "#10b981", position: "top" }} />
                <RechartsTooltip
                  formatter={(v, _n, item) => {
                    const r = item.payload;
                    return [`${Number(v).toFixed(0)}% (${formatKm(r.fieldB10)}${r.extrapolated ? ", extrapolated" : ""} · ${r.failures} failures · ${r.riskTier ?? "?"} risk)`, "B10 vs design"];
                  }}
                />
                <Bar dataKey="pctOfDesign" radius={[0, 3, 3, 0]} onClick={(d) => onOpenPart(d.partId ?? d.payload?.partId)} className="cursor-pointer">
                  {scorecard.map((r) => (
                    <Cell key={r.key} fill={RISK_TIER_COLORS[r.riskTier] ?? "#94a3b8"} />
                  ))}
                  <LabelList dataKey="failures" position="right" formatter={(v) => `n=${v}`} style={{ fontSize: 10, fill: "#94a3b8" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Risk Tier Check"
          tooltip="Median field B10 (% of design) across each supplier risk tier's part × supplier groups with at least 5 failures. If the High-risk tier is not clearly worse, the procurement risk rating does not match field behaviour."
        >
          {loading ? (
            <ChartSkeleton />
          ) : tiers.length === 0 ? (
            <EmptyChart message="Not enough rated groups." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={tiers} margin={{ top: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="tier" tickFormatter={(t) => `${t} risk`} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis domain={[0, 110]} unit="%" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={44} />
                <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 3" />
                <RechartsTooltip formatter={(v, _n, item) => [`${v}% (${item.payload.groups} groups, ${item.payload.failures} failures)`, "Median B10 vs design"]} />
                <Bar dataKey="median" radius={[3, 3, 0, 0]}>
                  {tiers.map((t) => (
                    <Cell key={t.tier} fill={t.color} />
                  ))}
                  <LabelList dataKey="groups" position="top" formatter={(v) => `${v} groups`} style={{ fontSize: 10, fill: "#94a3b8" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Build Cohort × Age at Failure"
        tooltip="Rows = production quarter; columns = vehicle age when the part failed. Cell = failures per 100 trucks of that cohort that have reached that age. A single hot row points to a build-period quality problem (a bad batch or process change); a hot column is normal ageing. Cohorts with fewer than 5 trucks exposed are greyed."
      >
        {loading ? (
          <ChartSkeleton />
        ) : cohorts.rows.length === 0 ? (
          <EmptyChart message="No production dates for the trucks in scope." />
        ) : (
          <HeatGrid
            rows={cohorts.rows.map((r) => ({ ...r, label: `${r.label} (${r.trucks})` }))}
            cols={cohorts.cols}
            max={cohorts.max}
            rgb="139, 92, 246"
            rowLabelWidth={110}
            cellHeight="h-9"
            cellFor={(ri, ci) => {
              const r = cohorts.rows[ri];
              const c = cohorts.cols[ci];
              const cell = cohorts.cells.get(`${r.id}|${c.id}`);
              if (cell.exposed === 0) return { empty: true, title: `${r.label}: no trucks this old yet` };
              return {
                value: cell.per100,
                display: formatNumber(cell.per100, 0),
                sub: `${cell.count}`,
                muted: cell.muted,
                title: `${r.label} · ${c.label}: ${cell.count} failures across ${cell.exposed} trucks that reached this age (${cell.per100.toFixed(1)} per 100)`,
              };
            }}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Where Parts Fail"
        tooltip="Failures per 100,000 km of part life for the 12 most-replaced components, by duty cycle, region or model. Normalising by km separates tough duty (mining, construction) from genuinely weak parts. Groups with fewer than 5 trucks are greyed. Click a cell to open the part."
        actions={<Segmented value={dim} onChange={setDim} options={WHERE_DIMS} />}
      >
        {loading ? (
          <ChartSkeleton height="h-96" />
        ) : where.rows.length === 0 ? (
          <EmptyChart message="No failures." />
        ) : (
          <HeatGrid
            rows={where.rows}
            cols={where.cols}
            max={where.max}
            rgb="14, 165, 233"
            rowLabelWidth={180}
            minColWidth={72}
            cellHeight="h-9"
            colLabel={(c) => truncateString(c.label, 16)}
            cellFor={(ri, ci) => {
              const r = where.rows[ri];
              const c = where.cols[ci];
              const cell = where.cells.get(`${r.id}|${c.id}`);
              if (cell.empty) return { empty: true, title: `${r.label} is not fitted in ${c.label}` };
              return {
                value: cell.rate ?? 0,
                display: formatNumber(cell.rate, 2),
                sub: `${cell.failures}`,
                muted: cell.muted,
                title: `${r.label} · ${c.label}: ${cell.failures} failures, ${cell.rate?.toFixed(3) ?? "—"} per 100k km (${cell.trucks} trucks)`,
                onClick: () => onOpenPart(r.id),
              };
            }}
          />
        )}
      </ChartCard>
    </div>
  );
}
