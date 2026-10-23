import React, { useMemo, useState } from "react";
import { BAR_CHART_PROPS, BAR_GRID, BAR_MAX_SIZE, BAR_RADIUS, BAR_X_AXIS, BAR_Y_AXIS, VALUE_LABEL } from "../../components/ui/barStyle";
import { AlertTriangle, ArrowDownUp, BellRing, Clock, SlidersHorizontal } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
  LabelList,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import { modelColors } from "../telematics/telematicsMetrics";
import {
  anomalyTrend,
  bandDistribution,
  healthSignals,
  latestReadings,
  leadTimes,
  signalWatchlist,
  signalHeatGroups,
  signalHeatmap,
  signalKpis,
  sortHeatmap,
  signalTrendByModel,
  stateMeta,
  dpfScatter,
} from "./diagnosticsMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatDay, formatNumber, formatPct } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, HeatGrid, Pill, Segmented } from "../telematics/TelematicsUi";
import { StatePill } from "./diagnosticsUi";
import BandStrip from "./BandStrip";

const SHORT_SIGNAL = {
  COOLANT_TEMP: "Coolant",
  OIL_PRESSURE: "Oil P",
  BATTERY_VOLTAGE: "24V batt",
  DPF_SOOT_LOAD: "DPF soot",
  DPF_DIFF_PRESSURE: "DPF ΔP",
  SCR_EFFICIENCY: "SCR eff",
  BOOST_PRESSURE: "Boost",
  FUEL_RAIL_PRESSURE: "Rail P",
  AIR_PRESSURE: "Air P",
  BRAKE_LINING_REMAINING: "Brake lining",
  TYRE_PRESSURE: "Tyre P",
  HV_SOH: "HV SoH",
  HV_BATTERY_TEMP: "HV temp",
};
// Charts hidden from the dashboard on request (2026-10-01); flip to true to restore.
const SHOW = { bandDistribution: false, anomalyTrend: false, leadTime: false, dpfScatter: false, scrTrend: false };

const HEAT_MAX = 4; // state rank (0–3) + up to 0.9 for |z|
const SCR_MODEL_PALETTE = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#e11d48"];

function DpfTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="font-semibold text-slate-700">{p.vin}</p>
      <p className="text-slate-500">
        Soot {p.x.toFixed(0)} % · ΔP {p.y.toFixed(1)} kPa
      </p>
      <p className="text-[10px] text-slate-400">Click to open the truck</p>
    </div>
  );
}

export default function SignalHealthTab({ raw, loading: fleetLoading, signalHealth, onOpenAsset }) {
  const [sort, setSort] = useState({ key: "risk", dir: "desc" });
  const [heatBy, setHeatBy] = useState("truck"); // truck | model | application
  const [heatFilter, setHeatFilter] = useState(null); // { by, id, label } limits the truck view to one group
  const { data: sig, error } = signalHealth;
  const loading = fleetLoading || signalHealth.loading;

  const signals = useMemo(() => healthSignals(sig), [sig]);
  const latest = useMemo(() => latestReadings(raw, sig), [raw, sig]);
  const lead = useMemo(() => leadTimes(raw, sig), [raw, sig]);
  const kpis = useMemo(() => signalKpis(raw, sig, latest, lead), [raw, sig, latest, lead]);
  const heat = useMemo(() => signalHeatmap(raw, sig, latest, signals), [raw, sig, latest, signals]);
  const distribution = useMemo(() => bandDistribution(latest, signals), [latest, signals]);
  const trend = useMemo(() => anomalyTrend(raw, sig), [raw, sig]);
  const dpf = useMemo(() => dpfScatter(raw, latest), [raw, latest]);
  const watchlist = useMemo(() => signalWatchlist(raw, sig, latest), [raw, sig, latest]);
  const scr = useMemo(() => signalTrendByModel(raw, sig, "SCR_EFFICIENCY"), [raw, sig]);
  const signalByCode = useMemo(() => new Map(sig.signals.map((s) => [s.signal_code, s])), [sig.signals]);
  const colors = useMemo(() => modelColors(raw.vehicles), [raw.vehicles]);

  if (error) {
    return <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Couldn't load signal data: {error.message}</div>;
  }

  const heatScoped = heatFilter ? heat.filter((t) => (heatFilter.by === "model" ? t.modelId : t.application) === heatFilter.id) : heat;
  const heatRows = sortHeatmap(heatScoped, sort.key, sort.dir);
  const heatGroups = heatBy === "truck" ? [] : signalHeatGroups(heat, signals, heatBy);
  const groupNoun = heatBy === "application" ? "application" : "model";
  const sortedSignal = signals.find((s) => s.signal_code === sort.key);
  const textSort = sort.key === "vin" || sort.key === "model";
  const dirLabel = textSort ? (sort.dir === "asc" ? "A → Z" : "Z → A") : sort.dir === "desc" ? "Worst first" : "Best first";
  const sortName = sort.key === "risk" ? "overall risk" : textSort ? (sort.key === "vin" ? "VIN" : "model") : sortedSignal?.signal_name ?? sort.key;
  const sortLabel = `${sortName}, ${dirLabel.toLowerCase().replace("a → z", "A → Z").replace("z → a", "Z → A")}`;
  const scrSignal = signalByCode.get("SCR_EFFICIENCY");
  const dpfSoot = signalByCode.get("DPF_SOOT_LOAD");
  const dpfDp = signalByCode.get("DPF_DIFF_PRESSURE");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Trucks with Critical Signal"
          badge="NOW"
          value={formatNumber(kpis.critTrucks)}
          subtitle={`of ${raw.vehicles.length} trucks in scope`}
          icon={AlertTriangle}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip="Trucks whose latest daily reading of at least one health signal is beyond the signal's critical threshold (dim_signal, direction-aware). These are degrading components that may not have thrown a fault code yet."
        />
        <KpiCard
          title="Signals Out of Band"
          badge="NOW"
          value={formatNumber(kpis.outOfBand)}
          subtitle={`of ${formatNumber(kpis.pairs)} truck × signal pairs`}
          icon={SlidersHorizontal}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="Truck × signal pairs whose latest daily mean is outside the signal's normal band (including warning and critical). A broad early-warning count for the workshop planner."
        />
        <KpiCard
          title="Trucks with Anomalies"
          badge="PERIOD"
          value={formatNumber(kpis.anomalousTrucks)}
          subtitle="at least one anomalous reading"
          icon={BellRing}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip="Trucks with at least one anomalous reading in the period (|z| > 3, or Mahalanobis > 3 with |z| > 2). Anomalies catch unusual behaviour even inside the normal band."
        />
        <KpiCard
          title="Anomaly → DTC Lead Time"
          badge="PERIOD"
          value={kpis.medianLead !== null ? `${formatNumber(kpis.medianLead, 0)} d` : "—"}
          subtitle={kpis.warnedPct !== null ? `${formatPct(kpis.warnedPct, 0)} of ${lead.linked} linked codes had a prior anomaly` : "No linked codes in the period"}
          icon={Clock}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Median days between the first anomalous reading of the drifting signal (from the code's freeze frame) and the fault code itself, looking back up to 30 days. This is the head start signal monitoring gives the workshop."
        />
      </div>

      <ChartCard
        title={heatBy === "truck" ? "Truck × Signal Health Map" : `${heatBy === "model" ? "Model" : "Application"} × Signal Health Map`}
        badge="NOW"
        tooltip="Latest daily reading of every health signal per truck. Colour follows the band state (critical darkest, then warning, then outside normal); the number is the day's max |z-score|. All trucks are listed. Sort by overall risk, VIN or model with the buttons, or click a signal's column header to sort by that signal (worst first; click again to reverse). Click a cell to open the truck with that signal in focus."
        actions={
          <>
            <Segmented
              value={heatBy}
              onChange={(v) => {
                setHeatBy(v);
                setHeatFilter(null);
              }}
              options={[
                { value: "truck", label: "Trucks" },
                { value: "model", label: "Models" },
                { value: "application", label: "Applications" },
              ]}
            />
            {heatBy === "truck" && (
            <>
            <Segmented
              value={["risk", "vin", "model"].includes(sort.key) ? sort.key : null}
              onChange={(key) => setSort({ key, dir: key === "risk" ? "desc" : "asc" })}
              options={[{ value: "risk", label: "Risk" }, { value: "vin", label: "VIN" }, { value: "model", label: "Model" }]}
            />
            <button
              type="button"
              onClick={() => setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Reverse the sort order"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {dirLabel}
            </button>
            </>
            )}
          </>
        }
      >
        {loading ? (
          <ChartSkeleton height="h-96" />
        ) : heat.length === 0 ? (
          <EmptyChart message="No health-signal readings in this period." />
        ) : heatBy !== "truck" ? (
          <>
            <HeatGrid
              rows={heatGroups.map((g) => ({ id: g.id, label: `${g.label} (${g.trucks})` }))}
              cols={signals.map((s) => ({ id: s.signal_code, label: s.signal_name }))}
              colLabel={(c) => SHORT_SIGNAL[c.id] ?? c.label}
              max={Math.max(10, ...heatGroups.flatMap((g) => Object.values(g.cells).map((c) => c.share)))}
              rgb="225, 29, 72"
              rowLabelWidth={190}
              minColWidth={56}
              cellHeight="h-10"
              gapClass="gap-0.5"
              cellFor={(ri, ci) => {
                const g = heatGroups[ri];
                const s = signals[ci];
                const c = g.cells[s.signal_code];
                if (!c) return { empty: true, title: `${g.label} · ${s.signal_name}: not fitted` };
                return {
                  value: c.share,
                  display: `${Math.round(c.share)}%`,
                  sub: `${c.critical + c.warning}/${c.n}`,
                  title: `${g.label} · ${s.signal_name}: ${c.critical} critical, ${c.warning} warning, ${c.outside} outside normal of ${c.n} trucks · mean max |z| ${formatNumber(c.meanZ, 1)} · click for the trucks`,
                  onClick: () => {
                    setHeatFilter({ by: heatBy, id: g.id, label: g.label });
                    setHeatBy("truck");
                    setSort({ key: s.signal_code, dir: "desc" });
                  },
                };
              }}
            />
            <p className="mt-2 text-[11px] text-slate-400">
              Cell = share of the {groupNoun}'s trucks whose latest reading is in warning or critical (small number = trucks / trucks reporting). Rows sorted by the share of
              trucks with any warning or critical signal; the count in brackets is trucks. Click a cell to list those trucks.
            </p>
          </>
        ) : (
          <>
            {heatFilter && (
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-white">
                  {heatFilter.by === "model" ? "Model" : "Application"}: {heatFilter.label}
                  <button type="button" aria-label="Clear group filter" onClick={() => setHeatFilter(null)}>
                    ×
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setHeatBy(heatFilter.by);
                    setHeatFilter(null);
                  }}
                  className="text-slate-500 underline-offset-2 hover:underline"
                >
                  Back to {heatFilter.by === "model" ? "models" : "applications"}
                </button>
              </div>
            )}
            <div className="pr-1">
              <HeatGrid
                scrollClass="max-h-[32rem]"
                sortId={signals.some((s) => s.signal_code === sort.key) ? sort.key : null}
                sortDir={sort.dir}
                onColClick={(c) => setSort((s) => (s.key === c.id ? { key: c.id, dir: s.dir === "desc" ? "asc" : "desc" } : { key: c.id, dir: "desc" }))}
                rows={heatRows.map((t) => ({ id: t.vehicleId, label: t.vin }))}
                cols={signals.map((s) => ({ id: s.signal_code, label: s.signal_name }))}
                colLabel={(c) => SHORT_SIGNAL[c.id] ?? c.label}
                max={HEAT_MAX}
                rowLabelWidth={150}
                minColWidth={52}
                cellHeight="h-7"
                gapClass="gap-0.5"
                cellFor={(ri, ci) => {
                  const t = heatRows[ri];
                  const s = signals[ci];
                  const cell = t.cells[s.signal_code];
                  if (!cell) return { empty: true, title: `${s.signal_name}: not fitted` };
                  const meta = stateMeta(cell.state);
                  return {
                    value: (meta?.rank ?? 0) + Math.min(cell.z / 10, 0.9),
                    display: formatNumber(cell.z, 1),
                    title: `${t.vin} (${t.modelLabel}) · ${s.signal_name}: ${formatNumber(cell.value, 1)} ${s.unit} on ${formatDay(cell.date)} · ${meta?.label ?? "—"} · max |z| ${formatNumber(cell.z, 1)}`,
                    onClick: () => onOpenAsset(t.vehicleId, s.signal_code),
                  };
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Darker = worse band state · number = max |z|. {heatRows.filter((t) => t.worst >= 2).length} of {heatRows.length} trucks have a warning or critical signal. Sorted by {sortLabel}.
            </p>
          </>
        )}
      </ChartCard>

      {(SHOW.bandDistribution || SHOW.anomalyTrend || SHOW.leadTime) && (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {SHOW.bandDistribution && (
        <ChartCard
          title="Signals vs Normal Band"
          badge="NOW"
          tooltip="Each signal on its own scale: green = normal band, amber tick = warning, red tick = critical. Box = middle 50 % of trucks' latest values, whiskers = P5–P95, black tick = median. A box drifting towards a red tick is a fleet-wide problem, not a single truck."
        >
          {loading ? (
            <ChartSkeleton height="h-96" />
          ) : distribution.length === 0 ? (
            <EmptyChart message="No readings." />
          ) : (
            <div className="divide-y divide-slate-50">
              {distribution.map((row) => (
                <BandStrip key={row.signal.signal_code} row={row} />
              ))}
            </div>
          )}
        </ChartCard>
        )}

        <div className={`space-y-4 ${SHOW.bandDistribution ? "" : "xl:col-span-2"}`}>
          {SHOW.anomalyTrend && (
          <ChartCard
            title="Anomaly Trend"
            badge="PERIOD"
            tooltip="Share of reporting truck-days with at least one anomalous health-signal reading, 7-day rolling (ratio of sums). Sustained rises precede fault-code waves."
          >
            {loading ? (
              <ChartSkeleton />
            ) : trend.length === 0 ? (
              <EmptyChart message="No readings in this period." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
                  <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={40} unit="%" />
                  <RechartsTooltip labelFormatter={formatDay} formatter={(v, _n, item) => [`${v}% (${item.payload.trucks} trucks that day)`, "Anomalous truck-days"]} />
                  <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          )}

          {SHOW.leadTime && (
          <ChartCard
            title="Anomaly → DTC Lead Time"
            badge="PERIOD"
            tooltip="For each non-intermittent code first seen in the period whose freeze frame names a drifting signal: how many days before the code that signal first read anomalous (30-day look-back). 'No warning' = the code arrived without prior anomalies."
          >
            {loading ? (
              <ChartSkeleton height="h-48" />
            ) : lead.linked === 0 ? (
              <EmptyChart height="h-48" message="No fault codes with a linked signal in this period." />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={lead.buckets} {...BAR_CHART_PROPS}>
                  <CartesianGrid {...BAR_GRID} />
                  <XAxis dataKey="label" {...BAR_X_AXIS} />
                  <YAxis allowDecimals={false} {...BAR_Y_AXIS} width={32} />
                  <RechartsTooltip formatter={(v) => [v, "Fault codes"]} />
                  <Bar dataKey="count" radius={BAR_RADIUS} maxBarSize={BAR_MAX_SIZE}>
                    {lead.buckets.map((b) => (
                      <Cell key={b.label} fill={b.warned ? "#10b981" : "#cbd5e1"} />
                    ))}
                    <LabelList dataKey="count" {...VALUE_LABEL} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          )}
        </div>
      </div>
      )}

      {(SHOW.dpfScatter || SHOW.scrTrend) && (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {SHOW.dpfScatter && (
        <ChartCard
          title="DPF Soot Load vs Differential Pressure"
          badge="NOW"
          tooltip="Latest daily mean per diesel truck. Soot and pressure normally rise together; high pressure at low soot suggests ash loading or a blocked filter, high soot at low pressure a cracked filter or sensor fault. Shaded = normal region. Click a point to open the truck."
        >
          {loading ? (
            <ChartSkeleton />
          ) : dpf.length === 0 ? (
            <EmptyChart message="No diesel trucks with DPF readings in scope." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ top: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                {dpfSoot && dpfDp && <ReferenceArea x1={dpfSoot.normal_min} x2={dpfSoot.normal_max} y1={dpfDp.normal_min} y2={dpfDp.normal_max} fill="#10b981" fillOpacity={0.06} />}
                {dpfSoot?.crit_threshold !== undefined && <ReferenceLine x={dpfSoot.crit_threshold} stroke="#e11d48" strokeDasharray="4 3" />}
                {dpfDp?.crit_threshold !== undefined && <ReferenceLine y={dpfDp.crit_threshold} stroke="#e11d48" strokeDasharray="4 3" />}
                <XAxis type="number" dataKey="x" name="Soot" unit="%" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="number" dataKey="y" name="ΔP" unit=" kPa" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={56} />
                <ZAxis range={[36, 36]} />
                <RechartsTooltip content={<DpfTooltip />} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                {dpf.map((g) => (
                  <Scatter key={g.modelId} name={g.label} data={g.points} fill={colors[g.modelId]} onClick={(p) => onOpenAsset(p.vehicleId ?? p.payload?.vehicleId, "DPF_SOOT_LOAD")} className="cursor-pointer" />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        )}

        {SHOW.scrTrend && (
        <ChartCard
          className={SHOW.dpfScatter ? "" : "xl:col-span-2"}
          title="SCR NOx Conversion Efficiency by Model"
          badge="PERIOD"
          tooltip="Mean daily SCR efficiency per model, 7-day rolling. Efficiency sliding towards the warning line points to DEF injector / dosing faults or poor AdBlue quality, and is an emissions-compliance risk."
        >
          {loading ? (
            <ChartSkeleton />
          ) : scr.models.length === 0 ? (
            <EmptyChart message="No diesel trucks in scope." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={scr.rows}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
                <YAxis domain={["auto", "auto"]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={48} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
                {scrSignal && <ReferenceLine y={scrSignal.warn_threshold} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: "warning", fontSize: 10, fill: "#f59e0b", position: "insideBottomRight" }} />}
                <RechartsTooltip labelFormatter={formatDay} formatter={(v, name) => [v === null ? "—" : `${v}%`, name]} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                {scr.models.map((m, i) => (
                  <Line key={m} type="monotone" dataKey={m} stroke={SCR_MODEL_PALETTE[i % SCR_MODEL_PALETTE.length]} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        )}
      </div>
      )}

      <DataTable
        title="Signal Watchlist"
        tooltip="Every truck × health signal whose latest daily value is outside the normal band, worst first: critical, then warning, then just outside; then by days out of band. Trend = slope of the daily mean over the last 14 days with data (worsening / improving relative to the signal's bad direction). Linked fault = an active code whose freeze frame names this signal; likely part from the fault-code → part mapping. Click a row to open the truck on that signal."
        loading={loading}
        rows={watchlist}
        rowKey={(r) => r.key}
        onRowClick={(r) => onOpenAsset(r.vehicleId, r.signalCode)}
        emptyMessage="Every monitored signal is inside its normal band."
        searchPlaceholder="Search VIN, signal, code or part"
        searchText={(r) => `${r.vin} ${r.vehicleId} ${r.modelLabel ?? ""} ${r.signalName} ${r.dtcId ?? ""} ${r.part ?? ""}`}
        csvName="signal-watchlist.csv"
        columns={[
          {
            key: "truck",
            label: "Truck",
            sortValue: (r) => r.vin,
            csv: (r) => r.vin,
            render: (r) => (
              <div>
                <p className="font-medium text-slate-700">{r.vin}</p>
                <p className="text-[11px] text-slate-400">
                  {r.modelLabel} · {r.regionName}
                </p>
              </div>
            ),
          },
          { key: "signal", label: "Signal", sortValue: (r) => r.signalName, csv: (r) => r.signalName, render: (r) => <span className="text-xs">{r.signalName}</span> },
          {
            key: "value",
            label: "Latest",
            align: "right",
            sortValue: (r) => r.value,
            csv: (r) => r.value,
            render: (r) => (
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-700">
                  {formatNumber(r.value, 1)} {r.unit}
                </p>
                <p className="text-[11px] text-slate-400">{formatDay(r.date)}</p>
              </div>
            ),
          },
          {
            key: "band",
            label: "Normal band",
            csv: (r) => `${r.normalMin}-${r.normalMax}`,
            render: (r) => (
              <span className="whitespace-nowrap text-xs text-slate-500">
                {formatNumber(r.normalMin, 1)}–{formatNumber(r.normalMax, 1)} {r.unit}
              </span>
            ),
          },
          { key: "state", label: "State", sortValue: (r) => r.stateRank, csv: (r) => r.state, render: (r) => <StatePill state={r.state} /> },
          { key: "days", label: "Days out", align: "right", sortValue: (r) => r.daysOut, csv: (r) => r.daysOut, render: (r) => r.daysOut },
          {
            key: "trend",
            label: "Trend (14 d)",
            sortValue: (r) => (r.trend === "worsening" ? 2 : r.trend === "stable" ? 1 : 0),
            csv: (r) => `${r.trend}${r.slopePerWeek !== null ? ` ${r.slopePerWeek.toFixed(2)}/wk` : ""}`,
            render: (r) => (
              <span
                className={`whitespace-nowrap text-xs ${r.trend === "worsening" ? "font-semibold text-rose-600" : r.trend === "improving" ? "text-emerald-600" : "text-slate-500"}`}
                title={r.slopePerWeek !== null ? `${r.slopePerWeek > 0 ? "+" : ""}${r.slopePerWeek.toFixed(2)} ${r.unit} per week` : "Too few days"}
              >
                {r.trend === "worsening" ? "▲ worsening" : r.trend === "improving" ? "▼ improving" : "■ stable"}
              </span>
            ),
          },
          {
            key: "dtc",
            label: "Linked fault",
            sortValue: (r) => r.dtcId ?? "",
            csv: (r) => r.dtcId ?? "",
            render: (r) =>
              r.dtcId ? (
                <div>
                  <p className="text-xs text-slate-700">{r.dtcName}</p>
                  <p className="text-[11px] text-slate-400">{r.dtcId}</p>
                </div>
              ) : (
                <Pill className="bg-amber-50 text-amber-700">No code yet</Pill>
              ),
          },
          { key: "part", label: "Likely part", sortValue: (r) => r.part ?? "", csv: (r) => r.part ?? "", render: (r) => <span className="text-xs">{r.part ?? "—"}</span> },
        ]}
      />
    </div>
  );
}
