import React, { useMemo } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatNumber } from "../telematics/telematicsFormat";
import { EmptyChart } from "../telematics/TelematicsUi";
import { WEIBULL_F_TICKS, formatKm, hazardByBucket, survivalCurves, weibullY } from "./reliabilityMetrics";

const KM_TICKS = [5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6];

function WeibullTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.km === undefined) return null;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="font-semibold text-slate-700">{formatKm(p.km)}</p>
      <p className="text-slate-500">F = {p.F.toFixed(1)} % failed</p>
    </div>
  );
}

/**
 * Linearised Weibull probability plot: x = ln(km), y = ln(−ln(1 − F)), axes labelled in km and
 * F %. A straight line means a good Weibull fit; its slope is β.
 */
export function WeibullPlot({ groups, designKm, height = 300 }) {
  const xs = groups.flatMap((g) => [...g.points, ...g.line].map((p) => p.x));
  if (xs.length === 0) return <EmptyChart message="Not enough failures to plot." />;
  const ys = groups.flatMap((g) => g.points.map((p) => p.y));
  const xDomain = [Math.min(...xs, designKm ? Math.log(designKm) : Infinity) - 0.1, Math.max(...xs, designKm ? Math.log(designKm) : -Infinity) + 0.1];
  const yTicks = WEIBULL_F_TICKS.map(weibullY);
  const yDomain = [Math.min(...ys, weibullY(1)), Math.max(...ys, weibullY(50))];
  const xTicks = KM_TICKS.map(Math.log).filter((x) => x >= xDomain[0] && x <= xDomain[1]);
  const fTickLabel = new Map(WEIBULL_F_TICKS.map((f) => [weibullY(f).toFixed(4), `${f}%`]));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis type="number" dataKey="x" domain={xDomain} ticks={xTicks} tickFormatter={(x) => formatKm(Math.exp(x))} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} allowDataOverflow />
        <YAxis
          type="number"
          dataKey="y"
          domain={yDomain}
          ticks={yTicks.filter((y) => y >= yDomain[0] - 0.01 && y <= yDomain[1] + 0.01)}
          tickFormatter={(y) => fTickLabel.get(Number(y).toFixed(4)) ?? ""}
          tick={AXIS_TICK}
          axisLine={AXIS_LINE}
          tickLine={false}
          width={40}
          allowDataOverflow
        />
        <ReferenceLine y={weibullY(10)} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: "B10", fontSize: 10, fill: "#64748b", position: "insideTopLeft" }} />
        {designKm && <ReferenceLine x={Math.log(designKm)} stroke="#10b981" strokeDasharray="4 3" label={{ value: "design B10", fontSize: 10, fill: "#10b981", position: "insideTopRight" }} />}
        <RechartsTooltip content={<WeibullTooltip />} />
        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={LEGEND_STYLE} />
        {groups.map((g) => (
          <Scatter
            key={g.id}
            name={`${g.label}${g.fit ? ` (β ${g.fit.beta.toFixed(2)}, η ${formatKm(g.fit.eta)})` : ` (n = ${g.failures}, no fit)`}`}
            data={g.points}
            fill={g.color}
            fillOpacity={0.8}
          />
        ))}
        {groups
          .filter((g) => g.line.length)
          .map((g) => (
            <Scatter key={`${g.id}-fit`} data={g.line} line={{ stroke: g.color, strokeWidth: 1.5 }} shape={() => null} legendType="none" isAnimationActive={false} />
          ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Kaplan–Meier survival (step lines), with a 90 % band when only one group is shown. */
export function SurvivalChart({ lt, partId, groupType, designKm, height = 280 }) {
  const curves = useMemo(() => survivalCurves(lt, partId, groupType), [lt, partId, groupType]);
  if (curves.groups.length === 0) return <EmptyChart message="Not enough failures in any group (at least 5 needed)." />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={curves.rows} margin={{ top: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="km" type="number" domain={[0, "dataMax"]} tickFormatter={formatKm} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis domain={[0, 100]} unit="%" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={44} />
        <ReferenceLine y={90} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: "B10", fontSize: 10, fill: "#64748b", position: "insideTopLeft" }} />
        {designKm && <ReferenceLine x={designKm} stroke="#10b981" strokeDasharray="4 3" label={{ value: "design B10", fontSize: 10, fill: "#10b981", position: "insideTopRight" }} />}
        <RechartsTooltip labelFormatter={(km) => formatKm(km)} formatter={(v, name) => (Array.isArray(v) ? [`${v[0]}–${v[1]}%`, "90% band"] : [`${v}%`, name])} />
        <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
        {curves.groups.length === 1 && <Area dataKey="band" stroke="none" fill={curves.groups[0].color} fillOpacity={0.12} legendType="none" isAnimationActive={false} />}
        {curves.groups.map((g) => (
          <Line key={g.id} type="stepAfter" dataKey={g.label} name={`${g.label} (${g.km.failures} failures)`} stroke={g.color} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Actuarial hazard by 50,000 km bucket (the bathtub curve). */
export function HazardChart({ lt, partId, height = 240 }) {
  const rows = useMemo(() => hazardByBucket(lt, partId), [lt, partId]);
  if (rows.length === 0) return <EmptyChart message="Not enough units at risk." />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={40} />
        <RechartsTooltip formatter={(v, _n, item) => [`${v} per 1,000 units (${formatNumber(item.payload.failures)} failures, ${item.payload.atRisk} at risk)`, "Hazard"]} />
        <Bar dataKey="rate" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
