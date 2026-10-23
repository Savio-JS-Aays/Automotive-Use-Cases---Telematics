import React, { useMemo, useRef, useState } from "react";
import { BAR_CHART_PROPS, BAR_GRID, BAR_MAX_SIZE, BAR_RADIUS, BAR_X_AXIS, BAR_Y_AXIS, BAR_Y_AXIS_LEFT, MAX_LABELLED_BARS, VALUE_LABEL } from "../../components/ui/barStyle";
import RankedBars from "../../components/ui/RankedBars";
import { Activity, Gauge, Route, Truck } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import {
  SILENT_HOURS,
  TRUCK_STATUSES,
  activityHeatmap,
  dataNow,
  hoursSplit,
  utilizationKpis,
  MATRIX_DIMENSIONS,
  MATRIX_METRICS,
  dimensionMatrix,
} from "./telematicsMetrics";
import { LEGEND_STYLE, formatAgo, formatDay, formatNumber, formatPct, STATUS_STYLES, truncateString } from "./telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, FilterChips, HeatGrid, Pill, Segmented } from "./TelematicsUi";

const EMPTY_CROSS = { regionId: null, modelId: null, application: null, vehicleType: null, powertrain: null, status: "All" };
// Matrix dimension → the roster cross-filter key it sets when a cell is clicked.
const DIM_CROSS_KEY = { region: "regionId", vehicleType: "vehicleType", model: "modelId", application: "application", powertrain: "powertrain" };
const DIM_OPTIONS = Object.entries(MATRIX_DIMENSIONS).map(([value, d]) => ({ value, label: d.label }));
const METRIC_OPTIONS = Object.entries(MATRIX_METRICS).map(([value, m]) => ({ value, label: m.label }));

export default function UtilizationTab({ raw, trucks, loading, onOpenAsset }) {
  const [grain, setGrain] = useState("day");
  const [heatMetric, setHeatMetric] = useState("running");
  const [cross, setCross] = useState(EMPTY_CROSS);
  const tableRef = useRef(null);

  const kpis = useMemo(() => utilizationKpis(raw), [raw]);
  const split = useMemo(() => hoursSplit(raw, grain), [raw, grain]);
  const heat = useMemo(() => activityHeatmap(raw, heatMetric), [raw, heatMetric]);
  const [rowDim, setRowDim] = useState("region");
  const [colDim, setColDim] = useState("model");
  const [matrixMetric, setMatrixMetric] = useState("utilization");
  const [matrixSearch, setMatrixSearch] = useState("");
  const matrix = useMemo(() => dimensionMatrix(trucks, rowDim, colDim, matrixMetric), [trucks, rowDim, colDim, matrixMetric]);
  const visibleRows = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase();
    return matrix.rows.map((r, ri) => ({ r, ri })).filter(({ r }) => !q || String(r.label).toLowerCase().includes(q));
  }, [matrix, matrixSearch]);
  const pickRowDim = (d) => {
    setRowDim(d);
    if (d === colDim) setColDim(d === "region" ? "model" : "region");
    setMatrixSearch("");
  };
  const pickColDim = (d) => {
    setColDim(d);
    if (d === rowDim) setRowDim(d === "region" ? "model" : "region");
  };
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
        if (cross.vehicleType && t.vehicleType !== cross.vehicleType) return false;
        if (cross.powertrain && t.powertrain !== cross.powertrain) return false;
        if (cross.status !== "All" && t.status !== cross.status) return false;
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
    cross.regionId && { key: "regionId", label: `Region: ${trucks.find((t) => t.regionId === cross.regionId)?.regionName ?? cross.regionId}` },
    cross.modelId && { key: "modelId", label: `Model: ${trucks.find((t) => t.modelId === cross.modelId)?.modelLabel ?? cross.modelId}` },
    cross.vehicleType && { key: "vehicleType", label: `Vehicle type: ${cross.vehicleType}` },
    cross.powertrain && { key: "powertrain", label: `Powertrain: ${cross.powertrain === "bev" ? "Battery-electric" : "Diesel"}` },
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
              <ComposedChart data={split} {...BAR_CHART_PROPS}>
                <CartesianGrid {...BAR_GRID} />
                <XAxis dataKey="date" tickFormatter={formatDay} {...BAR_X_AXIS} minTickGap={24} />
                <YAxis yAxisId="h" {...BAR_Y_AXIS_LEFT} width={36} unit="h" />
                <YAxis yAxisId="u" {...BAR_Y_AXIS} width={40} unit="%" />
                <RechartsTooltip
                  labelFormatter={(d) => (grain === "week" ? `Week of ${formatDay(d)}` : formatDay(d))}
                  formatter={(v, name) => (name === "Utilization" ? [`${v}%`, name] : [`${v} h`, name])}
                />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                <Bar yAxisId="h" dataKey="Drive" stackId="h" fill="#10b981" maxBarSize={BAR_MAX_SIZE} />
                <Bar yAxisId="h" dataKey="Idle" stackId="h" fill="#f59e0b" maxBarSize={BAR_MAX_SIZE} />
                <Bar yAxisId="h" dataKey="PTO" stackId="h" fill="#8b5cf6" radius={BAR_RADIUS} maxBarSize={BAR_MAX_SIZE}>
                  {split.length <= MAX_LABELLED_BARS && (
                    <LabelList dataKey={(d) => `${Math.round((d.Drive ?? 0) + (d.Idle ?? 0) + (d.PTO ?? 0))} h`} {...VALUE_LABEL} />
                  )}
                </Bar>
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
                rgb="8, 145, 178"
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
          className="xl:col-span-2"
          title={`${MATRIX_DIMENSIONS[rowDim].label} × ${MATRIX_DIMENSIONS[colDim].label}: ${MATRIX_METRICS[matrixMetric].label}`}
          subtitle="Compare any dimension across any other, for utilization or drive, idle and PTO hours"
          badge="PERIOD"
          tooltip="Pick what to analyse (rows), what to compare it across (columns) and the metric. Utilization = engine-on hours ÷ 24 h per truck-day; drive, idle and PTO = average hours per truck-day. Totals are computed over all trucks in the row, column or fleet. Cells with fewer than 5 trucks are grey. Click a cell or total to filter the roster below."
        >
          <div className="mb-4 space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Analyse</span>
                <Segmented value={rowDim} onChange={pickRowDim} options={DIM_OPTIONS} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Across</span>
                <Segmented value={colDim} onChange={pickColDim} options={DIM_OPTIONS.filter((o) => o.value !== rowDim)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Metric</span>
                <Segmented value={matrixMetric} onChange={setMatrixMetric} options={METRIC_OPTIONS} />
              </div>
              <input
                type="search"
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                placeholder={`Find a ${MATRIX_DIMENSIONS[rowDim].label.toLowerCase()}…`}
                className="w-56 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>
          {loading ? (
            <ChartSkeleton />
          ) : visibleRows.length === 0 ? (
            <EmptyChart message={matrix.rows.length === 0 ? "No connected trucks match the filters." : "Nothing matches that search."} />
          ) : (
            <>
              <HeatGrid
                rows={visibleRows.map(({ r }) => r)}
                cols={matrix.cols}
                colLabel={(c) => truncateString(String(c.label).replace("Mercedes-Benz ", "MB ").replace("BharatBenz ", "BB "), 14)}
                rowLabelWidth={110}
                max={matrix.max}
                rgb={MATRIX_METRICS[matrixMetric].rgb}
                cellFor={(vi, ci) => {
                  const ri = visibleRows[vi].ri;
                  const cell = matrix.cells[ri][ci];
                  const where = `${matrix.rows[ri].label} × ${matrix.cols[ci].label}`;
                  if (cell.trucks === 0) return { empty: true, title: `${where}: no trucks` };
                  return {
                    value: cell.value,
                    muted: cell.lowSample,
                    display: cell.lowSample || cell.value === null ? "—" : MATRIX_METRICS[matrixMetric].format(cell.value),
                    sub: `${cell.trucks} trucks`,
                    selected: cross[DIM_CROSS_KEY[rowDim]] === cell.rowId && cross[DIM_CROSS_KEY[colDim]] === cell.colId,
                    title: `${where}: ${cell.value === null ? "no data" : MATRIX_METRICS[matrixMetric].long(cell.value)} · ${cell.trucks} trucks${
                      cell.lowSample ? ` (fewer than ${matrix.minTrucks}, not rated)` : ""
                    }`,
                    onClick: () => applyCross({ [DIM_CROSS_KEY[rowDim]]: cell.rowId, [DIM_CROSS_KEY[colDim]]: cell.colId }),
                  };
                }}
                totals={{
                  colLabel: `All ${MATRIX_DIMENSIONS[colDim].label.toLowerCase()}s`,
                  rowLabel: `All ${MATRIX_DIMENSIONS[rowDim].label.toLowerCase()}s`,
                  row: (vi) => {
                    const ri = visibleRows[vi].ri;
                    const t = matrix.rowTotals[ri];
                    return {
                      display: t.value === null ? "—" : MATRIX_METRICS[matrixMetric].format(t.value),
                      sub: `${t.trucks} trucks`,
                      title: `${matrix.rows[ri].label}, all ${MATRIX_DIMENSIONS[colDim].label.toLowerCase()}s: ${t.value === null ? "no data" : MATRIX_METRICS[matrixMetric].long(t.value)} · ${t.trucks} trucks`,
                      onClick: () => applyCross({ [DIM_CROSS_KEY[rowDim]]: matrix.rows[ri].id }),
                    };
                  },
                  col: (ci) => {
                    const t = matrix.colTotals[ci];
                    return {
                      display: t.value === null ? "—" : MATRIX_METRICS[matrixMetric].format(t.value),
                      sub: `${t.trucks} trucks`,
                      title: `${matrix.cols[ci].label}, all ${MATRIX_DIMENSIONS[rowDim].label.toLowerCase()}s: ${t.value === null ? "no data" : MATRIX_METRICS[matrixMetric].long(t.value)} · ${t.trucks} trucks`,
                      onClick: () => applyCross({ [DIM_CROSS_KEY[colDim]]: matrix.cols[ci].id }),
                    };
                  },
                  grand: {
                    display: matrix.grand.value === null ? "—" : MATRIX_METRICS[matrixMetric].format(matrix.grand.value),
                    sub: `${matrix.grand.trucks} trucks`,
                    title: `Whole fleet in scope: ${matrix.grand.value === null ? "no data" : MATRIX_METRICS[matrixMetric].long(matrix.grand.value)} · ${matrix.grand.trucks} trucks`,
                  },
                }}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-2">
                  Low
                  <span
                    className="inline-block h-2 w-24 rounded-full"
                    style={{ background: `linear-gradient(90deg, rgba(${MATRIX_METRICS[matrixMetric].rgb}, 0.08), rgba(${MATRIX_METRICS[matrixMetric].rgb}, 0.9))` }}
                  />
                  High ({MATRIX_METRICS[matrixMetric].format(matrix.max)}+)
                </span>
                <span>Grey cells have fewer than {matrix.minTrucks} trucks and are not rated.</span>
              </div>
            </>
          )}
        </ChartCard>

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
        searchPlaceholder="Search VIN or vehicle"
        searchText={(r) => `${r.vin ?? ""} ${r.vehicleId}`}
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
