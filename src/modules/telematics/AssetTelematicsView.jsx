import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Fuel, Gauge, Route, ShieldCheck, Stethoscope, Timer } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import { useTelematicsAssetData } from "../../hooks/useTelematicsData";
import { useFilterStore } from "../../store/useFilterStore";
import { assetDailyTrend, assetKpis, assetTrips } from "./telematicsMetrics";
import {
  AXIS_LINE,
  AXIS_TICK,
  GRID_STROKE,
  LEGEND_STYLE,
  formatDateTime,
  formatDay,
  formatInr,
  formatNumber,
  formatPct,
} from "./telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, Pill } from "./TelematicsUi";

export default function AssetTelematicsView({ vehicleId }) {
  const navigate = useNavigate();
  const clearSelectedVin = useFilterStore((s) => s.clearSelectedVin);
  const { loading, error, raw } = useTelematicsAssetData(vehicleId);

  const kpis = useMemo(() => assetKpis(raw), [raw]);
  const daily = useMemo(() => assetDailyTrend(raw), [raw]);
  const trips = useMemo(() => assetTrips(raw), [raw]);

  const v = raw.vehicle;
  const bev = kpis.bev;

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        tooltip="Every ignition cycle in the period, newest first."
        loading={loading}
        rows={trips}
        rowKey={(r) => r.tripId}
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
              <span className={`whitespace-nowrap text-xs `}>{formatDateTime(r.startTs)}</span>
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

      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Gauge className="h-3 w-3" />
        Period metrics follow the global date range.
      </p>
    </div>
  );
}
