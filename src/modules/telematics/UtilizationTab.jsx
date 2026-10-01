import React, { useMemo, useRef, useState } from "react";
import { Activity, Gauge, Route, Truck } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import {
  SILENT_HOURS,
  TRUCK_STATUSES,
  activityHeatmap,
  dataNow,
  hoursSplit,
  utilizationByApplication,
  utilizationDistribution,
  utilizationKpis,
  utilizationMatrix,
} from "./telematicsMetrics";
import {
  AXIS_LINE,
  AXIS_TICK,
  GRID_STROKE,
  LEGEND_STYLE,
  formatAgo,
  formatDay,
  formatNumber,
  formatPct,
  STATUS_STYLES,
  truncateString,
} from "./telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, FilterChips, HeatGrid, Pill, Segmented } from "./TelematicsUi";

const EMPTY_CROSS = { regionId: null, modelId: null, band: null, application: null, status: "All" };

export default function UtilizationTab({ raw, trucks, loading, onOpenAsset }) {
  const [grain, setGrain] = useState("day");
  const [heatMetric, setHeatMetric] = useState("running");
  const [cross, setCross] = useState(EMPTY_CROSS);
  const tableRef = useRef(null);

  const kpis = useMemo(() => utilizationKpis(raw), [raw]);
  const split = useMemo(() => hoursSplit(raw, grain), [raw, grain]);
  const heat = useMemo(() => activityHeatmap(raw, heatMetric), [raw, heatMetric]);
  const matrix = useMemo(() => utilizationMatrix(trucks), [trucks]);
  const distribution = useMemo(() => utilizationDistribution(trucks), [trucks]);
  const byApp = useMemo(() => utilizationByApplication(trucks), [trucks]);
  const now = useMemo(() => dataNow(raw), [raw]);

  const applyCross = (patch) => {
    setCross((prev) => ({ ...prev, ...patch }));
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const rosterRows = useMemo(
    () =>
      trucks.filter((t) => {
        if (cross.regionId && t.regionId !== cross.regionId) return false;
        if (cross.modelId && t.modelId !== cross.modelId) return false;
        if (cross.application && t.applicationName !== cross.application) return false;
        if (cross.status !== "All" && t.status !== cross.status) return false;
        if (cross.band) {
          const [lo, hi] = cross.band;
          if (t.utilization === null || t.utilization < lo || t.utilization >= hi) return false;
        }
        return true;
      }),
    [trucks, cross]
  );

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(TRUCK_STATUSES.map((s) => [s, 0]));
    for (const t of trucks) counts[t.status] += 1;
    return counts;
  }, [trucks]);

  const chips = [
    cross.regionId && { key: "regionId", label: `Region: ${matrix.rows.find((r) => r.id === cross.regionId)?.label ?? cross.regionId}` },
    cross.modelId && { key: "modelId", label: `Model: ${matrix.cols.find((c) => c.id === cross.modelId)?.label ?? cross.modelId}` },
    cross.band && { key: "band", label: `Utilization ${cross.band[0]}–${cross.band[1] > 100 ? "100" : cross.band[1]}%` },
    cross.application && { key: "application", label: `Application: ${cross.application}` },
  ].filter(Boolean);

  const heatMax = heat.max || 1;
  const noData = !loading && trucks.length === 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Fleet Utilization"
          badge="PERIOD"
          value={formatPct(kpis.utilization)}
          delta={kpis.utilizationDelta !== null ? { value: kpis.utilizationDelta, unit: " pp" } : null}
          sparkline={kpis.sparkline}
          sparklineColor="#10b981"
          icon={Activity}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Engine-on hours ÷ (vehicle-days × 24 h). Tells the fleet owner how much of the calendar the assets are actually working. Sparkline = 7-day rolling; delta vs the previous period of equal length."
        />
        <KpiCard
          title="Active Trucks"
          badge="NOW"
          value={`${kpis.activeTrucks} / ${kpis.fleetSize}`}
          subtitle={kpis.latestDate ? `operating on ${formatDay(kpis.latestDate)}` : undefined}
          icon={Truck}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="Connected trucks that ran at least one trip on the latest day with data, out of all connected trucks in scope."
        />
        <KpiCard
          title="Vehicle Uptime"
          badge="PERIOD"
          value={formatPct(kpis.uptime)}
          delta={kpis.uptimeDelta !== null ? { value: kpis.uptimeDelta, unit: " pp" } : null}
          subtitle={`${kpis.workshopDays} workshop days · ${kpis.derateDays} derate / red-lamp days`}
          icon={Gauge}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Share of vehicle-days the truck was not in a workshop. Derate / red-lamp days are shown separately: the truck is available but limited."
        />
        <KpiCard
          title="Avg km per Operating Day"
          badge="PERIOD"
          value={kpis.kmPerOpDay !== null ? `${formatNumber(kpis.kmPerOpDay)} km` : "—"}
          delta={kpis.kmPerOpDayDelta !== null ? { value: kpis.kmPerOpDayDelta, unit: " km" } : null}
          icon={Route}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip="Distance ÷ days the truck actually operated. Separates 'working hard when used' from 'used often'."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Drive / Idle / PTO Hours per Truck-Day"
          badge="PERIOD"
          tooltip="Average engine-on hours per truck-day split into driving, idling and PTO (bars, left axis), with fleet utilization % (line, right axis; 7-day rolling on the daily view). Growing amber means fuel burned without producing kilometres."
          actions={<Segmented value={grain} onChange={setGrain} options={[{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }]} />}
        >
          {loading ? (
            <ChartSkeleton />
          ) : split.length === 0 ? (
            <EmptyChart message="No activity in this period." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={split}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
                <YAxis yAxisId="h" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={32} unit="h" />
                <YAxis yAxisId="u" orientation="right" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={40} unit="%" />
                <RechartsTooltip
                  labelFormatter={(d) => (grain === "week" ? `Week of ${formatDay(d)}` : formatDay(d))}
                  formatter={(v, name) => (name === "Utilization" ? [`${v}%`, name] : [`${v} h`, name])}
                />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                <Bar yAxisId="h" dataKey="Drive" stackId="h" fill="#10b981" />
                <Bar yAxisId="h" dataKey="Idle" stackId="h" fill="#f59e0b" />
                <Bar yAxisId="h" dataKey="PTO" stackId="h" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                <Line yAxisId="u" dataKey="utilization" name="Utilization" stroke="#0f172a" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Activity Heatmap (Hour × Weekday)"
          badge="PERIOD"
          tooltip="When the fleet actually works. 'Fleet running' = % of trucks with the engine on in that hour (from trips, local time). 'Trip starts' = average trips starting in that hour per day. Use it to plan shifts, depot staffing and workshop slots in quiet hours."
          actions={
            <Segmented
              value={heatMetric}
              onChange={setHeatMetric}
              options={[{ value: "running", label: "Fleet running %" }, { value: "starts", label: "Trip starts" }]}
            />
          }
        >
          {loading ? (
            <ChartSkeleton />
          ) : noData ? (
            <EmptyChart message="No connected trucks match the filters." />
          ) : (
            <>
              <HeatGrid
                rows={heat.weekdays.map((w) => ({ id: w, label: w }))}
                cols={Array.from({ length: 24 }, (_, h) => ({ id: String(h), label: String(h).padStart(2, "0") }))}
                colLabel={(c) => (Number(c.id) % 3 === 0 ? c.label : "")}
                rowLabelWidth={36}
                cellHeight="h-7"
                minColWidth={12}
                gapClass="gap-0.5"
                max={heatMax}
                rgb="16, 185, 129"
                cellFor={(ri, ci) => {
                  const v = heat.grid[ri][ci];
                  return {
                    value: v,
                    display: "",
                    title: `${heat.weekdays[ri]} ${String(ci).padStart(2, "0")}:00 · ${
                      heatMetric === "starts" ? `${v.toFixed(1)} trip starts / day` : `${v.toFixed(1)}% of fleet running`
                    }`,
                  };
                }}
              />
              <p className="mt-3 text-[11px] text-slate-400">
                Darker = busier. Peak: {heatMetric === "starts" ? `${heat.max.toFixed(1)} starts / day` : `${heat.max.toFixed(1)}% of fleet running`}. Hover a
                cell for the value.
              </p>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Region × Model Utilization"
          badge="PERIOD"
          tooltip="Utilization % for each region and model. Low cells are candidates for redeployment or a sales conversation about right-sizing. Click a cell to filter the roster below."
        >
          {loading ? (
            <ChartSkeleton />
          ) : matrix.rows.length === 0 ? (
            <EmptyChart message="No connected trucks match the filters." />
          ) : (
            <>
              <HeatGrid
                rows={matrix.rows}
                cols={matrix.cols}
                colLabel={(c) => truncateString(c.label.replace("Mercedes-Benz ", "MB ").replace("BharatBenz ", "BB "), 14)}
                max={60}
                rgb="16, 185, 129"
                cellFor={(ri, ci) => {
                  const cell = matrix.cells[ri][ci];
                  if (cell.trucks === 0) return { empty: true, title: "No trucks" };
                  return {
                    value: cell.value,
                    muted: cell.lowSample,
                    display: cell.lowSample ? "—" : formatPct(cell.value, 0),
                    sub: `${cell.trucks} trucks`,
                    selected: cross.regionId === cell.rowId && cross.modelId === cell.colId,
                    title: `${matrix.rows[ri].label} · ${matrix.cols[ci].label}: ${formatPct(cell.value)} utilization, ${cell.trucks} trucks${
                      cell.lowSample ? ` (fewer than ${matrix.minTrucks}, not rated)` : ""
                    }`,
                    onClick: () => applyCross({ regionId: cell.rowId, modelId: cell.colId }),
                  };
                }}
              />
              <p className="mt-3 text-[11px] text-slate-400">
                Darker green = higher utilization. Grey cells have fewer than {matrix.minTrucks} trucks and are not rated.
              </p>
            </>
          )}
        </ChartCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <ChartCard
            title="Utilization Distribution"
            badge="PERIOD"
            tooltip="Number of trucks in each utilization band. Amber = under-used (< 20%), blue = normal, green = high (≥ 50%). Click a bar to list those trucks."
          >
            {loading ? (
              <ChartSkeleton height="h-52" />
            ) : noData ? (
              <EmptyChart height="h-52" message="No trucks in scope." />
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="label" axisLine={AXIS_LINE} tickLine={false} interval={0} height={24} tick={{ ...AXIS_TICK, fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={28} />
                  <RechartsTooltip cursor={{ fill: "#f8fafc" }} labelFormatter={(l) => `Utilization ${l}%`} formatter={(v) => [`${v} trucks`, "Trucks"]} />
                  <Bar dataKey="trucks" radius={[3, 3, 0, 0]} className="cursor-pointer" onClick={(d) => applyCross({ band: [d.lo ?? d.payload?.lo, d.hi ?? d.payload?.hi] })}>
                    {distribution.map((b) => (
                      <Cell key={b.label} fill={b.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            title="Utilization by Application"
            badge="PERIOD"
            tooltip="Utilization % per duty cycle (application). Shows the OEM which vocations run its trucks hardest, which drives service intervals and product positioning. Click a bar to filter the roster."
          >
            {loading ? (
              <ChartSkeleton height="h-52" />
            ) : byApp.length === 0 ? (
              <EmptyChart height="h-52" message="No trucks in scope." />
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={byApp} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" unit="%" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tickFormatter={(v) => truncateString(v, 18)}
                    tick={AXIS_TICK}
                    axisLine={AXIS_LINE}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "#f8fafc" }}
                    formatter={(v, _n, item) => [`${v}% · ${item.payload.trucks} trucks · ${item.payload.kmPerOpDay} km/op. day`, "Utilization"]}
                  />
                  <Bar
                    dataKey="utilization"
                    fill="#0ea5e9"
                    radius={[0, 3, 3, 0]}
                    className="cursor-pointer"
                    onClick={(d) => applyCross({ application: d.name ?? d.payload?.name })}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>

      <DataTable
        tableRef={tableRef}
        title="Fleet Roster"
        tooltip={`Every connected truck in scope with its period totals. Status from the latest day, in priority order: Workshop, Derated (derate or red stop lamp), Silent (no packets that day or no report for ${SILENT_HOURS} h), Active (ran a trip), Parked. Click a row to open the truck's Asset View.`}
        loading={loading}
        rows={rosterRows}
        rowKey={(r) => r.vehicleId}
        onRowClick={(r) => onOpenAsset(r.vehicleId)}
        emptyMessage="No trucks match the current filters."
        searchPlaceholder="Search VIN, vehicle or driver"
        searchText={(r) => `${r.vin ?? ""} ${r.vehicleId} ${r.driverAlias ?? ""}`}
        initialSort={{ key: "utilization", dir: "asc" }}
        csvName="fleet-roster.csv"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            {["All", ...TRUCK_STATUSES].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setCross((prev) => ({ ...prev, status: s }))}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  cross.status === s ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {s}
                {s !== "All" && <span className="ml-1 text-slate-400">{statusCounts[s]}</span>}
              </button>
            ))}
            <FilterChips
              chips={chips}
              onRemove={(key) => setCross((prev) => ({ ...prev, [key]: EMPTY_CROSS[key] }))}
              onClear={() => setCross((prev) => ({ ...EMPTY_CROSS, status: prev.status }))}
            />
          </div>
        }
        columns={[
          {
            key: "vin",
            label: "Truck",
            sortValue: (r) => r.vin ?? r.vehicleId,
            csv: (r) => r.vin ?? r.vehicleId,
            render: (r) => (
              <>
                <div className="font-medium text-slate-700 group-hover:text-sky-700">{r.vin ?? r.vehicleId}</div>
                <div className="text-xs text-slate-400">
                  {r.modelLabel} · {r.regionName}
                </div>
              </>
            ),
          },
          { key: "driver", label: "Primary Driver", sortValue: (r) => r.driverAlias, csv: (r) => r.driverAlias, render: (r) => <span className="text-xs">{r.driverAlias ?? "—"}</span> },
          { key: "status", label: "Status", sortValue: (r) => r.status, csv: (r) => r.status, render: (r) => <Pill className={STATUS_STYLES[r.status]}>{r.status}</Pill> },
          { key: "utilization", label: "Utilization", align: "right", sortValue: (r) => r.utilization, csv: (r) => r.utilization?.toFixed(1), render: (r) => formatPct(r.utilization) },
          { key: "km", label: "Distance", align: "right", sortValue: (r) => r.km, csv: (r) => Math.round(r.km), render: (r) => `${formatNumber(r.km)} km` },
          { key: "idle", label: "Idle %", align: "right", sortValue: (r) => r.idlePct, csv: (r) => r.idlePct?.toFixed(1), render: (r) => formatPct(r.idlePct) },
          {
            key: "safety",
            label: "Safety",
            align: "right",
            sortValue: (r) => r.safety,
            csv: (r) => r.safety?.toFixed(1),
            render: (r) => (r.safety === null ? "—" : <span className={r.safety < 70 ? "font-semibold text-rose-600" : ""}>{r.safety.toFixed(0)}</span>),
          },
          { key: "eco", label: "Eco", align: "right", sortValue: (r) => r.eco, csv: (r) => r.eco?.toFixed(1), render: (r) => (r.eco === null ? "—" : r.eco.toFixed(0)) },
          {
            key: "completeness",
            label: "Data",
            align: "right",
            sortValue: (r) => r.completeness,
            csv: (r) => r.completeness?.toFixed(1),
            render: (r) => <span className={r.completeness !== null && r.completeness < 90 ? "text-amber-600" : ""}>{formatPct(r.completeness)}</span>,
          },
          {
            key: "ping",
            label: "Last Ping",
            sortValue: (r) => r.lastPing,
            csv: (r) => r.lastPing,
            render: (r) => <span className={`whitespace-nowrap text-xs ${r.status === "Silent" ? "font-medium text-violet-600" : "text-slate-500"}`}>{formatAgo(r.lastPing, now)}</span>,
          },
        ]}
      />
    </div>
  );
}
