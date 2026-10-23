import React, { useMemo, useState } from "react";

import RankedBars from "../../components/ui/RankedBars";
import Modal from "../../components/ui/Modal";
import { AlertTriangle, ScanEye, ShieldCheck, Siren } from "lucide-react";
import {
  Area,
  AreaChart,
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
  SAFETY_BANDS,
  SPEED_BANDS,
  bandOf,
  driverStats,
  eventRateTrend,
  eventSeverityMatrix,
  safetyBandsByGroup,
  safetyKpis,
  speedProfile,
  speedProfileByVehicle,
  safetyByGroup,
} from "./telematicsMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatDay, formatNumber } from "./telematicsFormat";
import { ChartCard, ChartSkeleton, EmptyChart, FilterChips, HeatGrid, LocalSelect, Segmented } from "./TelematicsUi";

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

export default function DriverSafetyTab({ raw, trucks = [], loading, onOpenAsset }) {
  const [filter, setFilter] = useState(EMPTY_EVENT_FILTER);
  const [minKm, setMinKm] = useState("500");
  const [groupBy, setGroupBy] = useState("model");
  const [profileGroup, setProfileGroup] = useState("application");
  const [speedDrill, setSpeedDrill] = useState(null); // { group, band }
  const [drillSearch, setDrillSearch] = useState("");
  const [safetyDrill, setSafetyDrill] = useState(null); // { id, label, band }
  const [safetySearch, setSafetySearch] = useState("");

  const kpis = useMemo(() => safetyKpis(raw, EMPTY_EVENT_FILTER), [raw]);
  const [trendModel, setTrendModel] = useState("all");
  const [trendRegion, setTrendRegion] = useState("all");
  const [trendApp, setTrendApp] = useState("all");
  const [trendWindow, setTrendWindow] = useState("7");
  const trendOptions = useMemo(() => {
    const opts = (allLabel, pairs) => [
      { value: "all", label: allLabel },
      ...[...new Map(pairs).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]))).map(([value, label]) => ({ value, label })),
    ];
    return {
      model: opts("All models", raw.vehicles.map((v) => [v.model_id, v.model_label])),
      region: opts("All regions", raw.vehicles.map((v) => [v.region_id, v.region_name])),
      app: opts("All applications", raw.vehicles.map((v) => [v.application_name ?? "Unknown", v.application_name ?? "Unknown"])),
    };
  }, [raw.vehicles]);
  const trendVehicles = useMemo(() => {
    if (trendModel === "all" && trendRegion === "all" && trendApp === "all") return null;
    return new Set(
      raw.vehicles
        .filter(
          (v) =>
            (trendModel === "all" || v.model_id === trendModel) &&
            (trendRegion === "all" || v.region_id === trendRegion) &&
            (trendApp === "all" || (v.application_name ?? "Unknown") === trendApp)
        )
        .map((v) => v.vehicle_id)
    );
  }, [raw.vehicles, trendModel, trendRegion, trendApp]);
  const trend = useMemo(
    () => eventRateTrend(raw, filter, { vehicleIds: trendVehicles, windowDays: Number(trendWindow) }),
    [raw, filter, trendVehicles, trendWindow]
  );
  const drivers = useMemo(() => driverStats(raw, filter), [raw, filter]);
  const groups = useMemo(() => safetyByGroup(raw, filter, groupBy, Number(minKm)), [raw, filter, groupBy, minKm]);
  const safetyRows = useMemo(() => {
    const events = new Map(groups.rows.map((g) => [g.id, g]));
    return safetyBandsByGroup(trucks, groupBy, Number(minKm))
      .map((r) => ({ ...r, ev: events.get(r.id) ?? null }))
      .sort((a, b) => b["Coach now"] - a["Coach now"] || b.Watch - a.Watch || (b.ev?.eventsPer1000 ?? 0) - (a.ev?.eventsPer1000 ?? 0));
  }, [trucks, groupBy, minKm, groups]);
  const ratedTrucks = safetyRows.reduce((s, r) => s + r.rated, 0);
  const safetyDrillRows = useMemo(() => {
    if (!safetyDrill) return [];
    const row = safetyRows.find((r) => r.id === safetyDrill.id);
    const q = safetySearch.trim().toLowerCase();
    return (row?.trucks ?? [])
      .filter((t) => t.band === safetyDrill.band)
      .filter((t) => !q || `${t.vin ?? ""} ${t.vehicleId} ${t.modelLabel} ${t.regionName}`.toLowerCase().includes(q))
      .map((t) => ({ ...t, eventsPer1000: t.km > 0 ? (t.harshEvents / t.km) * 1000 : null }))
      .sort((a, b) => a.safety - b.safety);
  }, [safetyDrill, safetyRows, safetySearch]);
  const matrix = useMemo(() => eventSeverityMatrix(raw), [raw]);
  const profile = useMemo(() => speedProfile(raw, profileGroup), [raw, profileGroup]);
  const drillTrucks = useMemo(
    () => (speedDrill ? speedProfileByVehicle(raw, profileGroup, speedDrill.group, speedDrill.band) : []),
    [raw, profileGroup, speedDrill]
  );
  const visibleDrill = useMemo(() => {
    const q = drillSearch.trim().toLowerCase();
    return q ? drillTrucks.filter((r) => `${r.vin ?? ""} ${r.vehicleId} ${r.modelLabel}`.toLowerCase().includes(q)) : drillTrucks;
  }, [drillTrucks, drillSearch]);
  const bandLabel = (key) => SPEED_BANDS.find((b) => b.key === key)?.label ?? key;
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          tooltip="All harsh, speed, ADAS and idling events ÷ fleet distance × 1,000. The rate, not the count, is comparable across periods and filters."
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

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center gap-3 px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Event filter</span>
          <span className="text-[11px] text-slate-400">applies to these two charts</span>
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
          <FilterChips chips={chips} onRemove={removeChip} onClear={() => setFilter(EMPTY_EVENT_FILTER)} />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          className="flex flex-col"
          title="Event Rate by Family (per 1,000 km)"
          subtitle={trendVehicles ? `${trendVehicles.size} trucks match the filters` : "All trucks in scope"}
          actions={
            <>
              <LocalSelect label="" value={trendModel} onChange={setTrendModel} options={trendOptions.model} />
              <LocalSelect label="" value={trendRegion} onChange={setTrendRegion} options={trendOptions.region} />
              <LocalSelect label="" value={trendApp} onChange={setTrendApp} options={trendOptions.app} />
              <Segmented
                size="xs"
                value={trendWindow}
                onChange={setTrendWindow}
                options={[
                  { value: "7", label: "7-day" },
                  { value: "1", label: "Daily" },
                ]}
              />
            </>
          }
          badge="PERIOD"
          tooltip="Events ÷ km × 1,000 per day, stacked by event family; 7-day = rolling 7-day sums (smooths weekday swings), Daily = each day on its own. Follows the event filter above, plus this card's own model, region and application filters, which limit both the events and the km to the matching trucks. Normalised by distance so busy days don't look riskier just because trucks drove more."
        >
          {loading ? (
            <ChartSkeleton />
          ) : trend.families.length === 0 ? (
            <EmptyChart message="All event families are filtered out." />
          ) : trendVehicles && trendVehicles.size === 0 ? (
            <EmptyChart message="No trucks match this model, region and application." />
          ) : (
            <div className="min-h-[260px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={36} />
                <RechartsTooltip labelFormatter={(d) => (trendWindow === "7" ? `7 days to ${formatDay(d)}` : formatDay(d))} formatter={(v, n) => [`${v} / 1,000 km`, n]} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                {trend.families.map((f) => (
                  <Area key={f.name} dataKey={f.name} stackId="e" stroke={f.color} fill={f.color} fillOpacity={0.35} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title={`Safety by ${GROUP_NOUN[groupBy]}: Score Bands & Event Rate`}
          subtitle={`${ratedTrucks} trucks rated · bar = share of trucks per safety band · right = events per 1,000 km`}
          badge="PERIOD"
          actions={
            <>
              <Segmented
                value={groupBy}
                onChange={(v) => {
                  setGroupBy(v);
                  setSafetyDrill(null);
                }}
                options={GROUP_OPTIONS}
              />
              <LocalSelect label="Rate trucks with" value={minKm} onChange={setMinKm} options={MIN_KM_OPTIONS} />
            </>
          }
          tooltip="For each group: the share of its trucks in each safety band (red = coach now < 70, amber = watch 70–85, green = good ≥ 85), from each truck's distance-weighted period safety score, and on the right the events per 1,000 km. The event rate follows the event filter above; the score bands do not (scores are computed from all events). Trucks with less distance than the 'Rate trucks with' threshold are not rated. Click a band to list those trucks."
        >
          {loading ? (
            <ChartSkeleton />
          ) : safetyRows.length === 0 ? (
            <EmptyChart message="No trucks with enough distance in this period." />
          ) : (
            <>
              <RankedBars
                rows={safetyRows}
                getLabel={(r) => r.label}
                segments={SAFETY_BANDS.map((b) => ({ key: b.name, color: b.color, name: b.name }))}
                max={100}
                formatValue={(r) => (r.ev?.eventsPer1000 == null ? "—" : `${r.ev.eventsPer1000.toFixed(1)} / 1k km`)}
                renderDetail={(r) =>
                  `${SAFETY_BANDS.map((b) => `${b.name}: ${r.counts[b.name]} (${r[b.name]}%)`).join(" · ")} · ${r.rated} trucks rated${
                    r.ev
                      ? ` · ${r.ev.eventsPer1000 === null ? "—" : r.ev.eventsPer1000.toFixed(1)} events / 1,000 km (${groups.families.map((f) => `${f.name} ${r.ev[f.name]}`).join(", ")}) · group safety ${r.ev.safety === null ? "—" : r.ev.safety.toFixed(1)}`
                      : ""
                  } · click a band for the trucks`
                }
                onSegmentClick={(r, band) => {
                  setSafetyDrill({ id: r.id, label: r.label, band });
                  setSafetySearch("");
                }}
                onRowClick={(r) => {
                  setSafetyDrill({ id: r.id, label: r.label, band: safetyDrill?.band ?? "Coach now" });
                  setSafetySearch("");
                }}
              />
              {groups.fleet?.eventsPer1000 != null && (
                <p className="mt-3 text-[11px] text-slate-400">Fleet: {groups.fleet.eventsPer1000.toFixed(1)} events per 1,000 km.</p>
              )}
            </>
          )}
        </ChartCard>

        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Event Type × Severity"
          badge="PERIOD"
          tooltip="Count of events for every type and severity in the period. Shows where the real risk sits, e.g. many low-severity idle events versus a few high-severity harsh brakes. Click a cell to set the event filter (Event Rate by Family and the event rate in Safety by Group) to that type and severity."
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
          title="Time in Speed Bands"
          badge="PERIOD"
          tooltip="Share of driving time in each rFMS speed class, from the trucks' accumulated-data histograms. Time above 80 km/h (red) is over the governed limit for Indian heavy trucks: a safety and fuel issue."
          actions={
            <Segmented
              value={profileGroup}
              onChange={(v) => {
                setProfileGroup(v);
                setSpeedDrill(null);
              }}
              options={[
                { value: "application", label: "By application" },
                { value: "model", label: "By model" },
                { value: "vehicleType", label: "By vehicle type" },
              ]}
            />
          }
        >
          {loading ? (
            <ChartSkeleton />
          ) : profile.length === 0 ? (
            <EmptyChart message="No trips in this period." />
          ) : (
            <>
              <RankedBars
                rows={profile}
                getLabel={(r) => r.name}
                segments={SPEED_BANDS.map((b) => ({ key: b.key, color: b.color, name: b.label }))}
                max={100}
                formatValue={(r) => `${r[">80"]}% > 80`}
                renderDetail={(r) => `${SPEED_BANDS.map((b) => `${b.label}: ${r[b.key]}%`).join(" · ")} · click a band for the trucks`}
                onRowClick={(r) => {
                  setSpeedDrill({ group: r.name, band: speedDrill?.band ?? ">80" });
                  setDrillSearch("");
                }}
                onSegmentClick={(r, band) => {
                  setSpeedDrill({ group: r.name, band });
                  setDrillSearch("");
                }}
              />
            </>
          )}
        </ChartCard>
      </div>

      <Modal
        open={Boolean(safetyDrill)}
        onClose={() => setSafetyDrill(null)}
        title={safetyDrill ? `${safetyDrill.label} · ${safetyDrill.band} trucks` : ""}
        subtitle={`${safetyDrillRows.length} trucks, lowest safety score first${onOpenAsset ? " · click a truck to open it" : ""}`}
        actions={
          safetyDrill && (
            <>
              <Segmented size="xs" value={safetyDrill.band} onChange={(band) => setSafetyDrill((p) => ({ ...p, band }))} options={SAFETY_BANDS.map((b) => b.name)} />
              <input
                type="search"
                value={safetySearch}
                onChange={(e) => setSafetySearch(e.target.value)}
                placeholder="Search VIN, vehicle or model"
                className="w-48 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
            </>
          )
        }
      >
        {safetyDrillRows.length === 0 ? (
          <p className="text-sm text-slate-400">No trucks in this band{safetySearch ? " match that search" : ""}.</p>
        ) : (
          <RankedBars
            rows={safetyDrillRows}
            getLabel={(t) => `${t.vin ?? t.vehicleId} · ${t.modelLabel} · ${t.regionName}`}
            valueKey="safety"
            max={100}
            getColor={(t) => SAFETY_BANDS.find((b) => b.name === t.band)?.color ?? "#94a3b8"}
            formatValue={(t) => `safety ${t.safety.toFixed(1)}`}
            renderDetail={(t) =>
              `Safety ${t.safety.toFixed(1)} · ${formatNumber(t.km)} km · ${t.harshEvents} events (${t.eventsPer1000 === null ? "—" : t.eventsPer1000.toFixed(1)} / 1,000 km, all types)`
            }
            onRowClick={onOpenAsset ? (t) => onOpenAsset(t.vehicleId) : undefined}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(speedDrill)}
        onClose={() => setSpeedDrill(null)}
        title={speedDrill ? `${speedDrill.group} · time at ${bandLabel(speedDrill.band)}${speedDrill.band === "0-30" ? "" : " km/h"}` : ""}
        subtitle={`${visibleDrill.length === drillTrucks.length ? drillTrucks.length : `${visibleDrill.length} of ${drillTrucks.length}`} trucks, highest share first · click a band to re-sort${onOpenAsset ? ", a truck to open it" : ""}`}
        actions={
          <input
            type="search"
            value={drillSearch}
            onChange={(e) => setDrillSearch(e.target.value)}
            placeholder="Search VIN, vehicle or model"
            className="w-52 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
          />
        }
      >
        {visibleDrill.length === 0 ? (
          <p className="text-sm text-slate-400">{drillTrucks.length === 0 ? "No trips for these trucks in the period." : "No truck matches that search."}</p>
        ) : (
          <RankedBars
            rows={visibleDrill}
            getLabel={(r) => `${r.vin ?? r.vehicleId} · ${r.modelLabel}`}
            segments={SPEED_BANDS.map((b) => ({ key: b.key, color: b.color, name: b.label }))}
            max={100}
            formatValue={(r) => (speedDrill ? `${r[speedDrill.band]}% at ${bandLabel(speedDrill.band)}` : "")}
            renderDetail={(r) => `${SPEED_BANDS.map((b) => `${b.label}: ${r[b.key]}%`).join(" · ")} · ${formatNumber(r.hours, 1)} h driven`}
            onRowClick={onOpenAsset ? (r) => onOpenAsset(r.vehicleId) : undefined}
            onSegmentClick={(_r, band) => setSpeedDrill((p) => ({ ...p, band }))}
          />
        )}
      </Modal>
    </div>
  );
}
