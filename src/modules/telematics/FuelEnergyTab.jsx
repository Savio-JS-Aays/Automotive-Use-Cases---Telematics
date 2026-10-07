import React, { useMemo, useState } from "react";
import { BatteryCharging, Droplets, Fuel, Leaf, Timer } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  ADBLUE_LOW_PCT,
  ADBLUE_NORMAL_PCT,
  DIESEL_PRICE_INR_PER_L,
  consumptionTrend,
  consumptionVsLoad,
  evStats,
  fuelKpis,
  fuelSplitByApplication,
  idleByGroup,
  modelBenchmark,
} from "./telematicsMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatDay, formatInr, formatNumber, formatPct, truncateString } from "./telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, LocalSelect, Segmented } from "./TelematicsUi";

const MIN_TRIP_KM_OPTIONS = [
  { value: "5", label: "≥ 5 km" },
  { value: "20", label: "≥ 20 km" },
  { value: "50", label: "≥ 50 km" },
  { value: "100", label: "≥ 100 km" },
];

function ScatterTip({ active, payload, unit, xLabel }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="font-semibold text-slate-700">{payload[0].name}</p>
      <p className="text-slate-600">
        {xLabel}: {p.x}
      </p>
      <p className="text-slate-600">
        {p.y} {unit} over {p.km} km
      </p>
      <p className="text-slate-400">{p.vehicleId} · click to open</p>
    </div>
  );
}

// Charts hidden from the dashboard on request (2026-10-01); flip to true to restore.
const SHOW = { energyVsTemperature: false };

export default function FuelEnergyTab({ raw, trucks, loading, onOpenAsset }) {
  const kpis = useMemo(() => fuelKpis(raw), [raw]);
  const defaultMode = kpis.hasDiesel ? "diesel" : "bev";
  const [modeChoice, setModeChoice] = useState(null);
  const mode = modeChoice && (modeChoice === "diesel" ? kpis.hasDiesel : kpis.hasBev) ? modeChoice : defaultMode;
  const [minKm, setMinKm] = useState("20");

  const unit = mode === "bev" ? "kWh/100 km" : "L/100 km";
  const trend = useMemo(() => consumptionTrend(raw, mode), [raw, mode]);
  const scatter = useMemo(() => consumptionVsLoad(raw, mode, Number(minKm)), [raw, mode, minKm]);
  const [idleBy, setIdleBy] = useState("model");
  const idleGroups = useMemo(() => idleByGroup(trucks, idleBy), [trucks, idleBy]);
  const split = useMemo(() => fuelSplitByApplication(raw), [raw]);
  const benchmark = useMemo(() => modelBenchmark(raw), [raw]);
  const ev = useMemo(() => (kpis.hasBev ? evStats(raw, Number(minKm)) : null), [raw, kpis.hasBev, minKm]);

  const modeToggle =
    kpis.hasDiesel && kpis.hasBev ? (
      <Segmented value={mode} onChange={setModeChoice} options={[{ value: "diesel", label: "Diesel L" }, { value: "bev", label: "BEV kWh" }]} />
    ) : null;

  const primaryConsumption = kpis.hasDiesel ? kpis.lPer100 : kpis.kwhPer100;
  const primaryDelta = kpis.hasDiesel ? kpis.lPer100Delta : kpis.kwhPer100Delta;

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${kpis.hasDiesel ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}>
        <KpiCard
          title={kpis.hasDiesel ? "Fuel Economy" : "Energy Economy"}
          badge="PERIOD"
          value={primaryConsumption !== null ? `${primaryConsumption.toFixed(1)} ${kpis.hasDiesel ? "L" : "kWh"}` : "—"}
          subtitle={
            kpis.hasDiesel && kpis.hasBev && kpis.kwhPer100 !== null
              ? `per 100 km (diesel) · BEV ${kpis.kwhPer100.toFixed(0)} kWh/100 km`
              : "per 100 km"
          }
          delta={primaryDelta !== null ? { value: primaryDelta, unit: kpis.hasDiesel ? " L" : " kWh", positiveIsGood: false } : null}
          icon={Fuel}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="Σ fuel ÷ Σ distance × 100 over diesel trucks (kWh for BEVs), from rFMS total fuel / energy counters. Lower is better; the delta compares with the previous period."
        />
        {kpis.hasDiesel && (
        <KpiCard
          title="Idle Waste Cost"
          badge="PERIOD"
          value={formatInr(kpis.idleCost)}
          subtitle={
            kpis.idleCostPerTruckMonth !== null
              ? `${formatInr(kpis.idleCostPerTruckMonth)} per truck / month · ${formatNumber(kpis.idleFuel)} L`
              : undefined
          }
          delta={kpis.idleCostChangePct !== null ? { value: kpis.idleCostChangePct, unit: "%", positiveIsGood: false } : null}
          icon={Timer}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip={`Measured idle fuel (rFMS 'fuel used at standstill') × ₹${DIESEL_PRICE_INR_PER_L}/L. Diesel only. This is money burned without moving: the easiest saving for a fleet.`}
        />
        )}
        <KpiCard
          title="Idle Share"
          badge="PERIOD"
          value={formatPct(kpis.idlePct)}
          subtitle="of engine-on time"
          delta={kpis.idlePctDelta !== null ? { value: kpis.idlePctDelta, unit: " pp", positiveIsGood: false } : null}
          icon={Timer}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="Σ idle hours ÷ Σ engine-on hours. Above ~20% usually means drivers keep the engine running while loading or waiting."
        />
        <KpiCard
          title="CO₂ Emitted"
          badge="PERIOD"
          value={`${formatNumber(kpis.co2T, 1)} t`}
          subtitle={kpis.co2PerKm !== null ? `${(kpis.co2PerKm * 100).toFixed(0)} kg per 100 km` : undefined}
          delta={kpis.co2ChangePct !== null ? { value: kpis.co2ChangePct, unit: "%", positiveIsGood: false } : null}
          icon={Leaf}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Tailpipe CO₂ = diesel litres × 2.68 kg. BEVs count as zero. Needed for customers' ESG reporting and for the OEM's fleet-average CO₂ targets."
        />
        {kpis.hasDiesel && (
        <KpiCard
          title="AdBlue : Diesel"
          badge="PERIOD"
          value={formatPct(kpis.adbluePct, 2)}
          subtitle={`normal ≈ ${ADBLUE_NORMAL_PCT}% · ${kpis.lowAdblueTrucks} trucks < ${ADBLUE_LOW_PCT}%`}
          delta={kpis.adbluePctDelta !== null ? { value: kpis.adbluePctDelta, unit: " pp" } : null}
          icon={Droplets}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip="AdBlue (DEF) litres ÷ diesel litres. A healthy SCR system doses ~5.5%. A low ratio on a truck points at a DEF dosing fault or emissions tampering: a compliance and warranty risk for the OEM."
        />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title={`Consumption Trend by Model (${unit})`}
          badge="PERIOD"
          tooltip="7-day rolling consumption per model: Σ fuel (or energy) ÷ Σ km over the trailing 7 days. Dashed lines are each model's rated consumption from the spec sheet. A model drifting above its rating is an engineering or driver-training signal."
          actions={modeToggle}
        >
          {loading ? (
            <ChartSkeleton />
          ) : trend.series.length === 0 ? (
            <EmptyChart message="No trucks of this powertrain in scope." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={36} domain={["auto", "auto"]} />
                <RechartsTooltip labelFormatter={formatDay} formatter={(v, name) => [v === null ? "—" : `${v} ${unit}`, name]} />
                <Legend verticalAlign="bottom" height={28} iconType="plainline" wrapperStyle={LEGEND_STYLE} />
                {trend.series.map((s) => (
                  <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
                ))}
                {trend.series
                  .filter((s) => s.rated)
                  .map((s) => (
                    <ReferenceLine key={`${s.key}-rated`} y={s.rated} stroke={s.color} strokeDasharray="4 4" strokeOpacity={0.6} />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Idle Share by Model and Region"
          badge="PERIOD"
          tooltip="Σ idle hours ÷ Σ engine-on hours per model or per region, with the fleet average as a dashed line. Aggregated groups show where duty cycle or site practice drives idling, which a single truck cannot. Tooltip adds the diesel idle cost per truck per month; BEVs burn no fuel, so they carry no cost."
          actions={
            <Segmented
              value={idleBy}
              onChange={setIdleBy}
              options={[{ value: "model", label: "By Model" }, { value: "region", label: "By Region" }]}
            />
          }
        >
          {loading ? (
            <ChartSkeleton />
          ) : idleGroups.rows.length === 0 ? (
            <EmptyChart message="No engine hours in this period." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={idleGroups.rows} layout="vertical" margin={{ left: 4, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" unit="%" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} domain={[0, "auto"]} />
                <YAxis type="category" dataKey="label" width={150} tickFormatter={(v) => truncateString(v, 22)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <RechartsTooltip
                  cursor={{ fill: "#f8fafc" }}
                  formatter={(v, _n, item) => {
                    const g = item.payload;
                    const cost = g.idleCostInr === null ? "no fuel cost (BEV)" : `${formatInr(g.idleCostInr)} · ${formatInr(g.costPerTruckMonthInr)} per truck / month`;
                    return [`${v}% · ${formatNumber(g.idleH)} idle h · ${g.trucks} trucks · ${cost}`, "Idle share"];
                  }}
                />
                {idleGroups.fleetPct !== null && (
                  <ReferenceLine
                    x={idleGroups.fleetPct}
                    stroke="#64748b"
                    strokeDasharray="4 4"
                    label={{ value: `Fleet ${idleGroups.fleetPct.toFixed(1)}%`, position: "insideTopRight", fontSize: 10, fill: "#64748b" }}
                  />
                )}
                <Bar dataKey="idlePct" fill="#f59e0b" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title={`Consumption vs Load (${unit})`}
          badge="PERIOD"
          tooltip="Each dot is a trip: average gross combination weight (x) against consumption (y), coloured by model. Shows how each model's efficiency scales with payload: the core product-benchmark view for the OEM. Short trips are excluded because start-up fuel distorts them."
          actions={
            <>
              {modeToggle}
              <LocalSelect label="Trips" value={minKm} onChange={setMinKm} options={MIN_TRIP_KM_OPTIONS} />
            </>
          }
        >
          {loading ? (
            <ChartSkeleton />
          ) : scatter.length === 0 ? (
            <EmptyChart message="No trips match." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" dataKey="x" name="GCW" unit=" t" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} domain={["auto", "auto"]} />
                  <YAxis type="number" dataKey="y" name="Consumption" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={36} domain={["auto", "auto"]} />
                  <ZAxis range={[14, 14]} />
                  <RechartsTooltip content={<ScatterTip unit={unit} xLabel="GCW (t)" />} />
                  <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                  {scatter.map((s) => (
                    <Scatter
                      key={s.key}
                      name={s.label}
                      data={s.points}
                      fill={s.color}
                      fillOpacity={0.55}
                      className="cursor-pointer"
                      onClick={(p) => onOpenAsset(p.vehicleId ?? p.payload?.vehicleId)}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
              <p className="mt-2 text-[11px] text-slate-400">
                {scatter.reduce((s, m) => s + m.total, 0).toLocaleString("en-IN")} trips; dense models are sampled for display.
              </p>
            </>
          )}
        </ChartCard>

        {kpis.hasDiesel && (
        <ChartCard
          title="Diesel Split: Driving / Idle / PTO by Application"
          badge="PERIOD"
          tooltip="Share of diesel burned while driving, idling and running the PTO (tipper, mixer, pump), per duty cycle, from trip fuel counters. High idle share in a vocation is a coaching or engine-stop-start opportunity; PTO share sizes the case for ePTO."
        >
          {loading ? (
            <ChartSkeleton />
          ) : split.length === 0 ? (
            <EmptyChart message="No diesel trips in scope." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={split} layout="vertical" margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" unit="%" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tickFormatter={(v) => truncateString(v, 20)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <RechartsTooltip
                  cursor={{ fill: "#f8fafc" }}
                  formatter={(v, name, item) => [`${v}% · ${formatNumber(item.payload.litres[name])} L`, name]}
                />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                <Bar dataKey="Driving" stackId="f" fill="#10b981" />
                <Bar dataKey="Idle" stackId="f" fill="#f59e0b" />
                <Bar dataKey="PTO" stackId="f" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        )}
      </div>

      {ev && (
        <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <BatteryCharging className="h-4 w-4 text-sky-600" />
            Battery-electric fleet
          </div>
          <div className={`grid grid-cols-1 gap-4 ${SHOW.energyVsTemperature ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Charging sessions", value: formatNumber(ev.sessions) },
                { label: "Energy charged", value: `${formatNumber(ev.kwh / 1000, 1)} MWh` },
                { label: "Blended cost", value: ev.perKwh !== null ? `₹${ev.perKwh.toFixed(1)}/kWh` : "—" },
                { label: "Public charging share", value: formatPct(ev.publicSharePct) },
                { label: "Charging spend", value: formatInr(ev.cost) },
                { label: "Regen share", value: formatPct(ev.regenSharePct) },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">{s.label}</div>
                  <div className="text-lg font-semibold text-slate-800">{loading ? "…" : s.value}</div>
                </div>
              ))}
            </div>

            <ChartCard
              title="Charging Mix"
              tooltip="Energy and cost by charger type. Public DC costs about twice the depot tariff, so a rising public share erodes the BEV total-cost-of-ownership case."
            >
              {loading ? (
                <ChartSkeleton height="h-48" />
              ) : ev.chargerMix.length === 0 ? (
                <EmptyChart height="h-48" message="No charging sessions." />
              ) : (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={ev.chargerMix} layout="vertical" margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)} MWh`} />
                    <YAxis type="category" dataKey="type" width={72} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                    <RechartsTooltip
                      cursor={{ fill: "#f8fafc" }}
                      formatter={(v, _n, item) => [
                        `${formatNumber(v)} kWh · ${formatInr(item.payload.cost)} · ₹${item.payload.perKwh}/kWh · ${item.payload.sessions} sessions · +${item.payload.avgSocGain}% SoC avg`,
                        "Energy",
                      ]}
                    />
                    <Bar dataKey="kwh" fill="#0ea5e9" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {SHOW.energyVsTemperature && (
            <ChartCard
              title="Energy Use vs Ambient Temperature"
              tooltip="Each dot is a BEV trip: ambient temperature (x) against kWh/100 km (y), with a fitted line. Cabin and battery cooling raise consumption in the heat; the slope tells customers how much range to plan for in summer."
            >
              {loading ? (
                <ChartSkeleton height="h-48" />
              ) : ev.tempPoints.length === 0 ? (
                <EmptyChart height="h-48" message="No BEV trips match." />
              ) : (
                <ResponsiveContainer width="100%" height={190}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis type="number" dataKey="x" unit="°C" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} domain={["auto", "auto"]} />
                    <YAxis type="number" dataKey="y" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={36} domain={["auto", "auto"]} />
                    <ZAxis range={[14, 14]} />
                    <RechartsTooltip content={<ScatterTip unit="kWh/100 km" xLabel="Ambient (°C)" />} />
                    <Scatter
                      name="BEV trips"
                      data={ev.tempPoints}
                      fill="#0ea5e9"
                      fillOpacity={0.45}
                      line={{ stroke: "#0369a1", strokeWidth: 2 }}
                      lineType="fitting"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
            )}
          </div>
        </div>
      )}

      <DataTable
        title="Model Efficiency Benchmark"
        tooltip="Actual consumption per model against its rated (spec-sheet) consumption, with the indicators that explain the gap. Gap > 0 means the model uses more than rated in this customer mix. The OEM's product and pre-sales teams use this to validate claims."
        loading={loading}
        rows={benchmark}
        rowKey={(r) => r.modelId}
        emptyMessage="No trucks in scope."
        csvName="model-benchmark.csv"
        maxHeight="max-h-80"
        initialSort={{ key: "gap", dir: "desc" }}
        columns={[
          { key: "model", label: "Model", sortValue: (r) => r.modelLabel, csv: (r) => r.modelLabel, className: "font-medium text-slate-700", render: (r) => r.modelLabel },
          { key: "trucks", label: "Trucks", align: "right", sortValue: (r) => r.trucks, csv: (r) => r.trucks, render: (r) => r.trucks },
          { key: "km", label: "Distance", align: "right", sortValue: (r) => r.km, csv: (r) => Math.round(r.km), render: (r) => `${formatNumber(r.km)} km` },
          {
            key: "actual",
            label: "Actual",
            align: "right",
            sortValue: (r) => r.actual,
            csv: (r) => r.actual?.toFixed(2),
            render: (r) => (r.actual === null ? "—" : `${r.actual.toFixed(1)} ${r.unit}`),
          },
          { key: "rated", label: "Rated", align: "right", sortValue: (r) => r.rated, csv: (r) => r.rated, render: (r) => (r.rated === null ? "—" : `${r.rated} ${r.unit}`) },
          {
            key: "gap",
            label: "Gap vs Rated",
            align: "right",
            sortValue: (r) => r.gapPct,
            csv: (r) => r.gapPct?.toFixed(1),
            render: (r) =>
              r.gapPct === null ? "—" : <span className={r.gapPct > 5 ? "font-semibold text-rose-600" : r.gapPct < -5 ? "text-emerald-600" : ""}>{`${r.gapPct > 0 ? "+" : ""}${r.gapPct.toFixed(1)}%`}</span>,
          },
          { key: "idle", label: "Idle %", align: "right", sortValue: (r) => r.idlePct, csv: (r) => r.idlePct?.toFixed(1), render: (r) => formatPct(r.idlePct) },
          {
            key: "adblue",
            label: "AdBlue %",
            align: "right",
            sortValue: (r) => r.adbluePct,
            csv: (r) => r.adbluePct?.toFixed(2),
            render: (r) => (r.adbluePct === null ? "—" : <span className={r.adbluePct < ADBLUE_LOW_PCT ? "text-rose-600" : ""}>{formatPct(r.adbluePct, 2)}</span>),
          },
          { key: "co2", label: "CO₂ / 100 km", align: "right", sortValue: (r) => r.co2PerKm, csv: (r) => r.co2PerKm?.toFixed(3), render: (r) => (r.co2PerKm === null ? "—" : `${(r.co2PerKm * 100).toFixed(0)} kg`) },
          { key: "eco", label: "Eco Score", align: "right", sortValue: (r) => r.eco, csv: (r) => r.eco?.toFixed(1), render: (r) => (r.eco === null ? "—" : r.eco.toFixed(0)) },
        ]}
      />
    </div>
  );
}
