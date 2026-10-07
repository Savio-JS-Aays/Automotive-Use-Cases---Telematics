import React, { useMemo, useState } from "react";
import { AlertTriangle, Leaf, ScanEye, ShieldCheck, Siren } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import {
  EMPTY_EVENT_FILTER,
  EVENT_FAMILIES,
  EVENT_LABELS,
  MATRIX_MIN_TRUCKS,
  SAFETY_BANDS,
  SPEED_BANDS,
  bandOf,
  driverStats,
  eventRateTrend,
  eventSeverityMatrix,
  safetyDistribution,
  safetyKpis,
  speedProfile,
  safetyByGroup,
} from "./telematicsMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatDay, formatNumber, truncateString } from "./telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, FilterChips, HeatGrid, LocalSelect, Pill, Segmented } from "./TelematicsUi";

const MIN_KM_OPTIONS = [
  { value: "100", label: "≥ 100 km" },
  { value: "500", label: "≥ 500 km" },
  { value: "1000", label: "≥ 1,000 km" },
  { value: "3000", label: "≥ 3,000 km" },
];

const SEVERITY_OPTIONS = [
  { value: "all", label: "All severities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const GROUP_OPTIONS = [
  { value: "model", label: "Model" },
  { value: "application", label: "Application" },
  { value: "region", label: "Region" },
];
const GROUP_NOUN = { model: "Model", application: "Application", region: "Region" };

const QUADRANT_SAFETY = 85;
const QUADRANT_ECO = 70;

function tensFrom(lo) {
  const ticks = [];
  for (let t = lo; t <= 100; t += 10) ticks.push(t);
  return ticks;
}

function QuadrantTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="font-semibold text-slate-700">{d.alias}</p>
      <p className="text-slate-600">
        Safety {d.safety.toFixed(1)} · Eco {d.eco.toFixed(0)}
      </p>
      <p className="text-slate-400">{formatNumber(d.km)} km</p>
    </div>
  );
}


// Charts hidden from the dashboard on request (2026-10-01); flip to true to restore.
const SHOW = { coachingQuadrant: false };

export default function DriverSafetyTab({ raw, loading }) {
  const [filter, setFilter] = useState(EMPTY_EVENT_FILTER);
  const [minKm, setMinKm] = useState("500");
  const [groupBy, setGroupBy] = useState("model");
  const [profileGroup, setProfileGroup] = useState("application");

  const kpis = useMemo(() => safetyKpis(raw, filter), [raw, filter]);
  const trend = useMemo(() => eventRateTrend(raw, filter), [raw, filter]);
  const drivers = useMemo(() => driverStats(raw, filter), [raw, filter]);
  const groups = useMemo(() => safetyByGroup(raw, filter, groupBy, Number(minKm)), [raw, filter, groupBy, minKm]);
  const distribution = useMemo(() => safetyDistribution(drivers, Number(minKm)), [drivers, minKm]);
  const matrix = useMemo(() => eventSeverityMatrix(raw), [raw]);
  const profile = useMemo(() => speedProfile(raw, profileGroup), [raw, profileGroup]);
  const quadrant = useMemo(
    () =>
      drivers
        .filter((d) => d.km >= Number(minKm) && d.safety !== null && d.eco !== null)
        .map((d) => ({ ...d, x: Number(d.eco.toFixed(1)), y: Number(d.safety.toFixed(1)), z: d.km })),
    [drivers, minKm]
  );
  const quadrantFloor = useMemo(() => {
    const floor = (field) => Math.max(0, Math.floor(Math.min(100, ...quadrant.map((d) => d[field])) / 10) * 10);
    return { eco: floor("x"), safety: floor("y") };
  }, [quadrant]);

  const toggleFamily = (name) => {
    setFilter((prev) => {
      const current = prev.families ?? EVENT_FAMILIES.map((f) => f.name);
      const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
      return { ...prev, families: next.length === EVENT_FAMILIES.length ? null : next };
    });
  };
  const familyActive = (name) => !filter.families || filter.families.includes(name);

  const chips = [
    filter.eventType && { key: "eventType", label: `Event: ${EVENT_LABELS[filter.eventType] ?? filter.eventType}` },
    filter.severity !== "all" && { key: "severity", label: `Severity: ${filter.severity}` },
    filter.families && { key: "families", label: `Families: ${filter.families.join(", ") || "none"}` },
  ].filter(Boolean);

  const removeChip = (key) => setFilter((prev) => ({ ...prev, [key]: EMPTY_EVENT_FILTER[key] }));

  const matrixMax = matrix.max || 1;

  return (
    <div className="space-y-4">
      {/* Local filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Event filter</span>
        {EVENT_FAMILIES.map((f) => (
          <button
            key={f.name}
            type="button"
            onClick={() => toggleFamily(f.name)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              familyActive(f.name) ? "border-slate-300 bg-white text-slate-700" : "border-slate-200 bg-slate-50 text-slate-400 line-through"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.color, opacity: familyActive(f.name) ? 1 : 0.3 }} />
            {f.name}
          </button>
        ))}
        <LocalSelect label="" value={filter.severity} onChange={(v) => setFilter((p) => ({ ...p, severity: v }))} options={SEVERITY_OPTIONS} />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Group by</span>
        <Segmented value={groupBy} onChange={setGroupBy} options={GROUP_OPTIONS} />
        <LocalSelect label="Rate drivers with" value={minKm} onChange={setMinKm} options={MIN_KM_OPTIONS} />
        <FilterChips chips={chips} onRemove={removeChip} onClear={() => setFilter(EMPTY_EVENT_FILTER)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title="Fleet Safety Score"
          badge="PERIOD"
          value={kpis.safety === null ? "—" : kpis.safety.toFixed(1)}
          delta={kpis.safetyDelta !== null ? { value: kpis.safetyDelta, unit: " pts" } : null}
          icon={ShieldCheck}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Distance-weighted average of the daily safety score: 100 − (Σ event penalties × 100 ÷ max(km, 100)) × 6, clamped to 0–100. Normalised by distance so long-haul and city trucks compare fairly. Not affected by the event filter."
        />
        <KpiCard
          title="Events per 1,000 km"
          badge="PERIOD"
          value={kpis.eventsPer1000 === null ? "—" : kpis.eventsPer1000.toFixed(2)}
          subtitle={`${formatNumber(kpis.events)} events`}
          delta={kpis.eventsPer1000Delta !== null ? { value: kpis.eventsPer1000Delta, positiveIsGood: false } : null}
          icon={AlertTriangle}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="Events matching the event filter ÷ fleet distance × 1,000. The rate, not the count, is comparable across periods and filters."
        />
        <KpiCard
          title="High-Severity Events"
          badge="PERIOD"
          value={formatNumber(kpis.highEvents)}
          icon={Siren}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip="Events rated high severity (e.g. peak g well above threshold, ABA full brake). These are the ones a safety manager reviews one by one."
        />
        <KpiCard
          title="Eco Score"
          badge="PERIOD"
          value={kpis.eco === null ? "—" : kpis.eco.toFixed(1)}
          icon={Leaf}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Distance-weighted trip eco score (0–100): penalises idling, time outside the RPM green band, braking, overspeed; rewards cruise control. Directly linked to fuel spend."
        />
        <KpiCard
          title="ADAS Activations"
          badge="PERIOD"
          value={kpis.adasPer1000 === null ? "—" : kpis.adasPer1000.toFixed(2)}
          subtitle={`per 1,000 km · ${kpis.adasTrucks} ADAS-equipped trucks`}
          icon={ScanEye}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip="Active Brake Assist warnings and full brakes, lane-departure and close-following warnings per 1,000 km on ADAS-equipped trucks (Actros L, eActros). Each ABA full brake is a probable avoided collision: evidence for the OEM's safety-system value."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Event Rate by Family (per 1,000 km)"
          badge="PERIOD"
          tooltip="7-day rolling events ÷ 7-day rolling km × 1,000, stacked by event family. Normalised by distance so busy weeks don't look riskier just because trucks drove more. A falling curve after a coaching campaign is proof it worked."
        >
          {loading ? (
            <ChartSkeleton />
          ) : trend.families.length === 0 ? (
            <EmptyChart message="All event families are filtered out." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={36} />
                <RechartsTooltip labelFormatter={(d) => `7 days to ${formatDay(d)}`} formatter={(v, n) => [`${v} / 1,000 km`, n]} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                {trend.families.map((f) => (
                  <Area key={f.name} dataKey={f.name} stackId="e" stroke={f.color} fill={f.color} fillOpacity={0.35} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title={`Safety Risk by ${GROUP_NOUN[groupBy]} (events per 1,000 km)`}
          badge="PERIOD"
          tooltip="Harsh, speed, ADAS and idling events per 1,000 km for each group of trucks, stacked by event family, with the fleet rate as a dashed line. Groups, not individual drivers, show where risk comes from: truck model, duty cycle or region. Safety score, trucks and high-severity share are in the tooltip. Follows the event filter."
        >
          {loading ? (
            <ChartSkeleton />
          ) : groups.rows.length === 0 ? (
            <EmptyChart message="No distance driven in this period." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={groups.rows} layout="vertical" margin={{ left: 4, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="category" dataKey="label" width={150} tickFormatter={(v) => truncateString(v, 22)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <RechartsTooltip
                  cursor={{ fill: "#f8fafc" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const g = payload[0].payload;
                    return (
                      <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
                        <p className="font-semibold text-slate-700">{g.label}</p>
                        <p className="text-slate-600">
                          {g.eventsPer1000 === null ? "—" : g.eventsPer1000.toFixed(1)} events / 1,000 km · safety {g.safety === null ? "—" : g.safety.toFixed(1)}
                        </p>
                        {groups.families.map((f) => (
                          <p key={f.name} className="text-slate-500">
                            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} />
                            {f.name}: {g[f.name]}
                          </p>
                        ))}
                        <p className="mt-1 text-slate-400">
                          {g.trucks} trucks · {formatNumber(g.km)} km
                          {g.highSeverityPct !== null ? ` · ${g.highSeverityPct.toFixed(0)}% high severity` : ""}
                          {g.lowSample ? ` · fewer than ${MATRIX_MIN_TRUCKS} trucks` : ""}
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                {groups.fleet?.eventsPer1000 !== null && groups.fleet && (
                  <ReferenceLine
                    x={groups.fleet.eventsPer1000}
                    stroke="#64748b"
                    strokeDasharray="4 4"
                    label={{ value: `Fleet ${groups.fleet.eventsPer1000.toFixed(1)}`, position: "insideTopRight", fontSize: 10, fill: "#64748b" }}
                  />
                )}
                {groups.families.map((f, i) => (
                  <Bar key={f.name} dataKey={f.name} stackId="g" fill={f.color} radius={i === groups.families.length - 1 ? [0, 3, 3, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Event Type × Severity"
          badge="PERIOD"
          tooltip="Count of events for every type and severity in the period. Shows where the real risk sits, e.g. many low-severity idle events versus a few high-severity harsh brakes. Click a cell to filter the whole tab to that type and severity."
        >
          {loading ? (
            <ChartSkeleton />
          ) : matrix.rows.length === 0 ? (
            <EmptyChart message="No events in this period." />
          ) : (
            <HeatGrid
              rows={matrix.rows}
              cols={matrix.cols.map((s) => ({ id: s, label: s[0].toUpperCase() + s.slice(1) }))}
              rowLabelWidth={130}
              cellHeight="h-8"
              max={matrixMax}
              cellFor={(ri, ci) => {
                const type = matrix.rows[ri].id;
                const sev = matrix.cols[ci];
                const n = matrix.counts.get(`${type}|${sev}`) ?? 0;
                if (n === 0) return { empty: true, title: "No events" };
                return {
                  value: n,
                  display: formatNumber(n),
                  selected: filter.eventType === type && filter.severity === sev,
                  title: `${matrix.rows[ri].label} · ${sev}: ${n} events (${matrix.rows[ri].family})`,
                  onClick: () => setFilter({ families: null, eventType: type, severity: sev }),
                };
              }}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Driver Safety Score Distribution"
          badge="PERIOD"
          tooltip={`How many drivers (with ${Number(minKm).toLocaleString("en-IN")} km or more) fall in each safety-score band. Red = coach now (< 70), amber = watch (70–85), green = good (≥ 85). A count per band, with no names: it shows how much of the driver pool needs coaching.`}
        >
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={28} />
                <RechartsTooltip cursor={{ fill: "#f8fafc" }} formatter={(v, _n, item) => [`${v} drivers`, item.payload.band]} />
                <Bar dataKey="drivers" radius={[3, 3, 0, 0]}>
                  {distribution.map((b) => (
                    <Cell key={b.label} fill={b.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {SHOW.coachingQuadrant && (
        <ChartCard
          title="Coaching Quadrant: Eco vs Safety"
          badge="PERIOD"
          tooltip={`Each bubble is a driver (size = km). Lines at safety ${QUADRANT_SAFETY} and eco ${QUADRANT_ECO} split drivers into role models (top right), coach on safety (bottom right), coach on eco-driving (top left) and coach on both (bottom left). `}
        >
          {loading ? (
            <ChartSkeleton />
          ) : quadrant.length === 0 ? (
            <EmptyChart message="No drivers meet the distance threshold." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" dataKey="x" name="Eco" domain={[quadrantFloor.eco, 100]} ticks={tensFrom(quadrantFloor.eco)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="number" dataKey="y" name="Safety" domain={[quadrantFloor.safety, 100]} ticks={tensFrom(quadrantFloor.safety)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={32} />
                <ZAxis type="number" dataKey="z" range={[20, 220]} />
                <ReferenceLine y={QUADRANT_SAFETY} stroke="#94a3b8" strokeDasharray="4 4" />
                <ReferenceLine x={QUADRANT_ECO} stroke="#94a3b8" strokeDasharray="4 4" />
                <RechartsTooltip content={<QuadrantTip />} />
                <Scatter data={quadrant}>
                  {quadrant.map((d) => (
                    <Cell key={d.driverId} fill={bandOf(SAFETY_BANDS, d.safety).color} fillOpacity={0.6} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        )}

        <ChartCard
          className={SHOW.coachingQuadrant ? "" : "xl:col-span-2"}
          title="Time in Speed Bands"
          badge="PERIOD"
          tooltip="Share of driving time in each rFMS speed class, from the trucks' accumulated-data histograms. Time above 80 km/h (red) is over the governed limit for Indian heavy trucks: a safety and fuel issue."
          actions={
            <Segmented value={profileGroup} onChange={setProfileGroup} options={[{ value: "application", label: "By application" }, { value: "model", label: "By model" }]} />
          }
        >
          {loading ? (
            <ChartSkeleton />
          ) : profile.length === 0 ? (
            <EmptyChart message="No trips in this period." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={profile} layout="vertical" margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" unit="%" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tickFormatter={(v) => truncateString(v, 20)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <RechartsTooltip cursor={{ fill: "#f8fafc" }} formatter={(v, n) => [`${v}%`, SPEED_BANDS.find((b) => b.key === n)?.label ?? n]} />
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  iconType="circle"
                  wrapperStyle={LEGEND_STYLE}
                  formatter={(v) => SPEED_BANDS.find((b) => b.key === v)?.label ?? v}
                />
                {SPEED_BANDS.map((b, i) => (
                  <Bar key={b.key} dataKey={b.key} stackId="s" fill={b.color} radius={i === SPEED_BANDS.length - 1 ? [0, 3, 3, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <DataTable
        title={`Safety Scorecard by ${GROUP_NOUN[groupBy]}`}
        tooltip={`One row per ${groupBy}. Safety and eco are distance-weighted; Δ = change in safety vs the previous period. Events, high-severity share and top event follow the event filter. Coach-now % = share of the group's drivers (with the minimum distance above) whose safety is below 70; a percentage only, no names. Groups with fewer than ${MATRIX_MIN_TRUCKS} trucks are not rated.`}
        loading={loading}
        rows={groups.rows}
        rowKey={(r) => r.id}
        emptyMessage="No groups match the current filters."
        searchPlaceholder={`Search ${groupBy}`}
        searchText={(r) => r.label}
        initialSort={{ key: "rate", dir: "desc" }}
        csvName={`safety-scorecard-by-${groupBy}.csv`}
        columns={[
          { key: "label", label: GROUP_NOUN[groupBy], sortValue: (r) => r.label, csv: (r) => r.label, className: "font-medium text-slate-700", render: (r) => r.label },
          {
            key: "band",
            label: "Band",
            sortValue: (r) => (r.lowSample ? null : r.safety),
            csv: (r) => (r.lowSample ? "Not rated" : r.band),
            render: (r) =>
              r.lowSample ? (
                <Pill className="bg-slate-100 text-slate-500">Not rated</Pill>
              ) : r.band ? (
                <Pill className={r.band === "Coach now" ? "bg-rose-100 text-rose-700" : r.band === "Watch" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                  {r.band}
                </Pill>
              ) : (
                "—"
              ),
          },
          { key: "safety", label: "Safety", align: "right", sortValue: (r) => r.safety, csv: (r) => r.safety?.toFixed(1), render: (r) => (r.safety === null ? "—" : r.safety.toFixed(1)) },
          {
            key: "delta",
            label: "Δ",
            align: "right",
            sortValue: (r) => r.safetyDelta,
            csv: (r) => r.safetyDelta?.toFixed(1),
            render: (r) =>
              r.safetyDelta === null ? (
                <span className="text-slate-300">—</span>
              ) : (
                <span className={r.safetyDelta >= 0.5 ? "text-emerald-600" : r.safetyDelta <= -0.5 ? "text-rose-600" : "text-slate-400"}>
                  {r.safetyDelta > 0 ? "+" : ""}
                  {r.safetyDelta.toFixed(1)}
                </span>
              ),
          },
          { key: "eco", label: "Eco", align: "right", sortValue: (r) => r.eco, csv: (r) => r.eco?.toFixed(1), render: (r) => (r.eco === null ? "—" : r.eco.toFixed(0)) },
          { key: "km", label: "Distance", align: "right", sortValue: (r) => r.km, csv: (r) => Math.round(r.km), render: (r) => `${formatNumber(r.km)} km` },
          { key: "trucks", label: "Trucks", align: "right", sortValue: (r) => r.trucks, csv: (r) => r.trucks, render: (r) => r.trucks },
          { key: "drivers", label: "Drivers", align: "right", sortValue: (r) => r.drivers, csv: (r) => r.drivers, render: (r) => r.drivers },
          {
            key: "rate",
            label: "Events / 1k km",
            align: "right",
            sortValue: (r) => r.eventsPer1000,
            csv: (r) => r.eventsPer1000?.toFixed(2),
            render: (r) => (r.eventsPer1000 === null ? "—" : r.eventsPer1000.toFixed(1)),
          },
          {
            key: "high",
            label: "High severity",
            align: "right",
            sortValue: (r) => r.highSeverityPct,
            csv: (r) => r.highSeverityPct?.toFixed(1),
            render: (r) => (r.highSeverityPct === null ? "—" : `${r.highSeverityPct.toFixed(0)}%`),
          },
          {
            key: "top",
            label: "Top Event",
            sortValue: (r) => r.topEventType,
            csv: (r) => EVENT_LABELS[r.topEventType] ?? r.topEventType,
            render: (r) => <span className="text-xs">{r.topEventType ? EVENT_LABELS[r.topEventType] : "—"}</span>,
          },
          {
            key: "coach",
            label: "Coach now",
            align: "right",
            sortValue: (r) => r.coachNowPct,
            csv: (r) => r.coachNowPct?.toFixed(1),
            render: (r) => (r.coachNowPct === null ? "—" : `${r.coachNowPct.toFixed(0)}%`),
          },
        ]}
      />
    </div>
  );
}
