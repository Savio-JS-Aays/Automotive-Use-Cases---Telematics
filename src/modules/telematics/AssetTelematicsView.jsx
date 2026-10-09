import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Fuel, Gauge, Leaf, MapPin, Route, ShieldCheck, Stethoscope, Timer, X } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import { useTelematicsAssetData, useVehicleDayTrace } from "../../hooks/useTelematicsData";
import { useFilterStore } from "../../store/useFilterStore";
import { EVENT_LABELS, OVERSPEED_LIMIT_KMH, assetDailyTrend, assetKpis, assetTrips, speedTrace } from "./telematicsMetrics";
import {
  AXIS_LINE,
  AXIS_TICK,
  GRID_STROKE,
  LEGEND_STYLE,
  SEVERITY_STYLES,
  formatClock,
  formatDateTime,
  formatDay,
  formatInr,
  formatNumber,
  formatPct,
} from "./telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, Pill } from "./TelematicsUi";

const SEVERITY_COLORS = { high: "#e11d48", medium: "#f59e0b", low: "#64748b" };

function TraceTooltip({ active, payload, levelLabel }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="font-semibold text-slate-700">{formatClock(p.t)}</p>
      {p.label ? (
        <p style={{ color: SEVERITY_COLORS[p.severity] }}>
          {p.label} ({p.severity}) at {p.speed} km/h
        </p>
      ) : (
        <>
          <p className="text-slate-600">{p.speed === null ? "—" : `${p.speed.toFixed(0)} km/h`}</p>
          {p.level !== null && p.level !== undefined && <p className="text-slate-400">{levelLabel} {Number(p.level).toFixed(1)}%</p>}
        </>
      )}
    </div>
  );
}

export default function AssetTelematicsView({ vehicleId }) {
  const navigate = useNavigate();
  const clearSelectedVin = useFilterStore((s) => s.clearSelectedVin);
  const { loading, error, raw } = useTelematicsAssetData(vehicleId);

  const [dayChoice, setDayChoice] = useState(null);
  const [tripId, setTripId] = useState(null);
  const [notice, setNotice] = useState(null);
  const traceDay = dayChoice && raw.traceDays.includes(dayChoice) ? dayChoice : raw.traceDays[raw.traceDays.length - 1] ?? null;
  const dayTrace = useVehicleDayTrace(vehicleId, traceDay);

  const kpis = useMemo(() => assetKpis(raw), [raw]);
  const daily = useMemo(() => assetDailyTrend(raw), [raw]);
  const trips = useMemo(() => assetTrips(raw), [raw]);
  const trace = useMemo(() => speedTrace(dayTrace.trace, tripId), [dayTrace.trace, tripId]);
  const domain = trace.points.length ? [trace.points[0].t, trace.points[trace.points.length - 1].t] : [0, 0];

  const events = useMemo(
    () =>
      [...raw.events]
        .filter((e) => !tripId || e.trip_id === tripId)
        .sort((a, b) => (a.ts < b.ts ? 1 : -1)),
    [raw.events, tripId]
  );

  const selectTrip = (trip) => {
    if (tripId === trip.tripId) {
      setTripId(null);
      return;
    }
    if (!raw.traceDays.includes(trip.dateId)) {
      setNotice(`Trip ${trip.tripId} is on ${formatDay(trip.dateId)}. 5-minute traces are kept for the last 7 days only; the event log is filtered to it.`);
      setTripId(trip.tripId);
      return;
    }
    setNotice(null);
    setDayChoice(trip.dateId);
    setTripId(trip.tripId);
  };

  const v = raw.vehicle;
  const bev = kpis.bev;
  const levelLabel = bev ? "State of charge" : "Fuel level";

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Couldn't load telematics for {vehicleId}: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-800">{v?.vin ?? vehicleId}</h1>
            {v && <Pill className={bev ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}>{bev ? "BEV" : "Diesel"}</Pill>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {v
              ? `${vehicleId} · ${v.model_label} · ${v.region_name} · ${v.application_name ?? "—"} · ${v.customer_type ?? "—"} · Primary driver ${v.primary_driver_alias ?? "—"}`
              : "Loading…"}
          </p>
          {kpis.lastPing && <p className="mt-0.5 text-xs text-slate-400">Last ping {formatDateTime(kpis.lastPing)}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate("/vehicle-diagnostics")}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Stethoscope className="h-3.5 w-3.5" />
            Open in Diagnostics
          </button>
          <button
            type="button"
            onClick={clearSelectedVin}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to fleet
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          title="Safety Score"
          badge="PERIOD"
          value={kpis.safety === null ? "—" : kpis.safety.toFixed(1)}
          subtitle={`${kpis.events} events · ${kpis.eventsPer1000 === null ? "—" : kpis.eventsPer1000.toFixed(1)} / 1,000 km`}
          icon={ShieldCheck}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Distance-weighted daily safety score for this truck over the period (all drivers who drove it)."
        />
        <KpiCard
          title="Eco Score"
          badge="PERIOD"
          value={kpis.eco === null ? "—" : kpis.eco.toFixed(1)}
          icon={Leaf}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Distance-weighted daily eco score: idling, RPM green band, braking, overspeed and cruise use."
        />
        <KpiCard
          title="Distance"
          badge="PERIOD"
          value={`${formatNumber(kpis.km)} km`}
          subtitle={`${kpis.opDays} of ${kpis.days} days operating · ${kpis.kmPerOpDay === null ? "—" : formatNumber(kpis.kmPerOpDay)} km/op. day`}
          icon={Route}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip="Odometer distance in the period and how many days the truck actually ran."
        />
        <KpiCard
          title={bev ? "Energy Use" : "Fuel Economy"}
          badge="PERIOD"
          value={kpis.consumption === null ? "—" : `${kpis.consumption.toFixed(1)}`}
          subtitle={kpis.rated ? `${kpis.consumptionUnit} · rated ${kpis.rated}` : kpis.consumptionUnit}
          delta={kpis.vsRatedPct !== null ? { value: kpis.vsRatedPct, unit: "%", positiveIsGood: false, label: "vs rated" } : null}
          icon={Fuel}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="Σ fuel (or energy) ÷ Σ km × 100 for this truck, compared with the model's rated consumption."
        />
        <KpiCard
          title="Idle Share"
          badge="PERIOD"
          value={formatPct(kpis.idlePct)}
          subtitle={!bev ? `${formatInr(kpis.idleCostInr)} idle fuel` : "of engine-on time"}
          icon={Timer}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="Idle hours ÷ engine-on hours; for diesel trucks, the cost of the measured idle fuel at ₹90/L."
        />
        <KpiCard
          title="Active DTCs"
          badge="NOW"
          value={kpis.activeDtcs}
          subtitle={kpis.redLampDtcs > 0 ? `${kpis.redLampDtcs} red lamp / derate` : "no red lamp"}
          icon={AlertTriangle}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          onClick={() => navigate("/vehicle-diagnostics")}
          tooltip="Fault codes currently active on the truck (J1939 DM1). Click to open Diagnostics."
        />
      </div>

      <ChartCard
        title={`Day Trace: Speed & ${levelLabel}`}
        badge="NOW"
        tooltip={`rFMS 5-minute snapshots for one day: wheel speed (blue line, left axis) with harsh events as dots coloured by severity, and ${bev ? "battery state of charge" : "tank level"} (dark line, right axis). The dashed line is the 80 km/h governed limit. ${bev ? "Steps up in charge are charging sessions." : "Steps up in level are refuels; a drop while parked is a possible fuel-theft signal."} Pick a day, or click a trip in the log to zoom to it.`}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            {raw.traceDays.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDayChoice(d);
                  setTripId(null);
                  setNotice(null);
                }}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  d === traceDay ? "bg-sky-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {formatDay(d)}
              </button>
            ))}
            {tripId && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-white">
                Trip {tripId}
                <button type="button" aria-label="Clear trip" onClick={() => { setTripId(null); setNotice(null); }}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        }
      >
        {notice && <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{notice}</p>}
        {loading || dayTrace.loading ? (
          <ChartSkeleton height="h-80" />
        ) : raw.traceDays.length === 0 ? (
          <EmptyChart message="No 5-minute snapshots for this truck (kept for the last 7 days only)." />
        ) : trace.points.length === 0 ? (
          <EmptyChart message="The truck did not run on this day or trip." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart margin={{ right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis type="number" dataKey="t" domain={domain} tickFormatter={formatClock} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={32} />
                <YAxis yAxisId="speed" dataKey="speed" unit=" km/h" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={60} domain={[0, "auto"]} />
                <YAxis yAxisId="level" orientation="right" domain={[0, 100]} unit="%" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={40} />
                <RechartsTooltip content={<TraceTooltip levelLabel={levelLabel} />} />
                <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                <ReferenceLine yAxisId="speed" y={OVERSPEED_LIMIT_KMH} stroke="#e11d48" strokeDasharray="4 4" />
                <Line yAxisId="speed" data={trace.points} dataKey="speed" name="Speed" stroke="#0ea5e9" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line yAxisId="level" data={trace.points} dataKey="level" name={levelLabel} stroke={bev ? "#10b981" : "#0f172a"} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Scatter yAxisId="speed" data={trace.events} dataKey="speed" name="Events" shape={(props) => (
                  <circle cx={props.cx} cy={props.cy} r={5} fill={SEVERITY_COLORS[props.payload.severity] ?? "#64748b"} stroke="#fff" strokeWidth={1.5} />
                )} />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4">
        <ChartCard
          title="Daily Distance & Engine Hours"
          badge="PERIOD"
          tooltip="Kilometres per day (bars) and engine-on hours (line) over the selected period. Days with no bar are parked or workshop days."
        >
          {loading ? (
            <ChartSkeleton height="h-52" />
          ) : daily.length === 0 ? (
            <EmptyChart height="h-52" message="No daily data." />
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
                <YAxis yAxisId="km" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={40} />
                <YAxis yAxisId="h" orientation="right" unit="h" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={32} />
                <RechartsTooltip labelFormatter={formatDay} formatter={(val, name) => [name === "Engine hours" ? `${val} h` : `${val} km`, name]} />
                <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                <Bar yAxisId="km" dataKey="km" name="Distance" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
                <Line yAxisId="h" dataKey="engineH" name="Engine hours" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <DataTable
        title="Trip Log"
        tooltip="Every ignition cycle in the period, newest first. Click a trip to zoom the day trace and event log to it (traces exist for the last 7 days)."
        loading={loading}
        rows={trips}
        rowKey={(r) => r.tripId}
        onRowClick={selectTrip}
        emptyMessage="No trips in this period."
        searchPlaceholder="Search city or trip ID"
        searchText={(r) => `${r.route} ${r.tripId}`}
        csvName={`${vehicleId}-trips.csv`}
        maxHeight="max-h-96"
        columns={[
          {
            key: "start",
            label: "Start",
            sortValue: (r) => r.startTs,
            csv: (r) => r.startTs,
            render: (r) => (
              <span className={`whitespace-nowrap text-xs ${r.tripId === tripId ? "font-semibold text-sky-700" : ""}`}>{formatDateTime(r.startTs)}</span>
            ),
          },
          { key: "route", label: "Route", sortValue: (r) => r.route, csv: (r) => r.route, render: (r) => <span className="text-xs">{r.route}</span> },
          { key: "km", label: "Distance", align: "right", sortValue: (r) => r.km, csv: (r) => r.km.toFixed(1), render: (r) => `${formatNumber(r.km, 1)} km` },
          { key: "dur", label: "Duration", align: "right", sortValue: (r) => r.durationH, csv: (r) => r.durationH.toFixed(2), render: (r) => `${r.durationH.toFixed(1)} h` },
          {
            key: "cons",
            label: bev ? "kWh/100 km" : "L/100 km",
            align: "right",
            sortValue: (r) => r.consumption,
            csv: (r) => r.consumption?.toFixed(1),
            render: (r) => (r.consumption === null ? "—" : r.consumption.toFixed(1)),
          },
          { key: "idle", label: "Idle %", align: "right", sortValue: (r) => r.idlePct, csv: (r) => r.idlePct?.toFixed(1), render: (r) => formatPct(r.idlePct) },
          {
            key: "events",
            label: "Events",
            align: "right",
            sortValue: (r) => r.events,
            csv: (r) => r.events,
            render: (r) => <span className={r.events > 0 ? "font-semibold text-rose-600" : ""}>{r.events}</span>,
          },
          { key: "eco", label: "Eco", align: "right", sortValue: (r) => r.eco, csv: (r) => r.eco, render: (r) => (r.eco === null ? "—" : Number(r.eco).toFixed(0)) },
        ]}
      />

      <DataTable
        title="Harsh & ADAS Event Log"
        tooltip="Every event in the period (or in the selected trip) with speed before → after, peak g and GPS position. Use it to review a specific incident with the driver."
        loading={loading}
        rows={events}
        rowKey={(r) => r.event_id}
        emptyMessage="No events recorded."
        csvName={`${vehicleId}-events.csv`}
        maxHeight="max-h-96"
        columns={[
          { key: "ts", label: "Time", sortValue: (r) => r.ts, csv: (r) => r.ts, render: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.ts)}</span> },
          {
            key: "type",
            label: "Event",
            sortValue: (r) => r.event_type,
            csv: (r) => EVENT_LABELS[r.event_type] ?? r.event_type,
            className: "font-medium text-slate-700",
            render: (r) => EVENT_LABELS[r.event_type] ?? r.event_type,
          },
          { key: "sev", label: "Severity", sortValue: (r) => r.severity, csv: (r) => r.severity, render: (r) => <Pill className={SEVERITY_STYLES[r.severity] ?? SEVERITY_STYLES.low}>{r.severity}</Pill> },
          {
            key: "speed",
            label: "Speed",
            align: "right",
            sortValue: (r) => r.speed_before_kmh,
            csv: (r) => `${r.speed_before_kmh ?? ""}->${r.speed_after_kmh ?? ""}`,
            render: (r) =>
              r.speed_before_kmh === null ? "—" : <span className="whitespace-nowrap text-xs">{`${Math.round(r.speed_before_kmh)} → ${Math.round(r.speed_after_kmh ?? 0)} km/h`}</span>,
          },
          { key: "g", label: "Peak g", align: "right", sortValue: (r) => r.peak_g, csv: (r) => r.peak_g, render: (r) => (r.peak_g === null ? "—" : Number(r.peak_g).toFixed(2)) },
          { key: "src", label: "Source", sortValue: (r) => r.source, csv: (r) => r.source, render: (r) => <span className="text-xs">{r.source ?? "—"}</span> },
          {
            key: "pos",
            label: "Position",
            csv: (r) => (r.lat === null ? "" : `${r.lat},${r.lon}`),
            render: (r) =>
              r.lat === null ? (
                "—"
              ) : (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=14/${r.lat}/${r.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-sky-600 hover:underline"
                >
                  <MapPin className="h-3 w-3" />
                  {Number(r.lat).toFixed(4)}, {Number(r.lon).toFixed(4)}
                </a>
              ),
          },
        ]}
      />

      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Gauge className="h-3 w-3" />
        Period metrics follow the global date range; the day trace uses rFMS snapshots, kept for the last 7 days.
      </p>
    </div>
  );
}
