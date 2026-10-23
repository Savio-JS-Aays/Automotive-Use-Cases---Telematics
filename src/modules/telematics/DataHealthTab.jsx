import React, { useMemo, useState } from "react";
import { Radio, RadioTower, SignalLow, WifiOff } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import { LOW_COMPLETENESS_PCT, SILENT_HOURS, completenessTrendBy, dataHealthKpis, dataNow } from "./telematicsMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, STATUS_STYLES, formatAgo, formatDay, formatNumber, formatPct } from "./telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, Pill, Segmented } from "./TelematicsUi";

const TARGET_PCT = 95;
const SERIES_COLORS = ["#e11d48", "#f59e0b", "#8b5cf6", "#0ea5e9", "#14b8a6", "#6366f1", "#ec4899", "#84cc16"];

export default function DataHealthTab({ raw, trucks, loading, onOpenAsset }) {
  const [groupBy, setGroupBy] = useState("region");
  const [onlyIssues, setOnlyIssues] = useState(true);

  const kpis = useMemo(() => dataHealthKpis(raw, trucks), [raw, trucks]);
  const trend = useMemo(() => completenessTrendBy(raw, groupBy), [raw, groupBy]);
  const now = useMemo(() => dataNow(raw), [raw]);

  const rows = useMemo(
    () =>
      trucks.filter(
        (t) => !onlyIssues || t.status === "Silent" || (t.completeness !== null && t.completeness < LOW_COMPLETENESS_PCT)
      ),
    [trucks, onlyIssues]
  );

  const trendMin = trend.data.reduce((m, p) => {
    for (const [k, v] of Object.entries(p)) if (k !== "date" && v !== null && v < m) m = v;
    return m;
  }, 100);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Connected Trucks"
          badge="NOW"
          value={formatNumber(kpis.connected)}
          subtitle="with an active telematics unit, in scope"
          icon={RadioTower}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="Trucks flagged is_connected in the vehicle master that match the global filters. Every other number in this module uses them as the denominator."
        />
        <KpiCard
          title="Data Completeness"
          badge="PERIOD"
          value={formatPct(kpis.completeness)}
          delta={kpis.completenessDelta !== null ? { value: kpis.completenessDelta, unit: " pp" } : null}
          icon={Radio}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Packets received ÷ packets expected (a 5-minute report while the engine runs plus an hourly heartbeat). Below ~95% the other KPIs for that group become less reliable."
        />
        <KpiCard
          title={`Trucks < ${LOW_COMPLETENESS_PCT}% Complete`}
          badge="PERIOD"
          value={formatNumber(kpis.lowCompletenessTrucks)}
          icon={SignalLow}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip={`Trucks whose completeness over the period is below ${LOW_COMPLETENESS_PCT}%. Usually poor network coverage on the route or a failing antenna / telematics unit.`}
        />
        <KpiCard
          title="Silent Trucks"
          badge="NOW"
          value={formatNumber(kpis.silentTrucks)}
          subtitle={`no packets on the latest day, or no report for ${SILENT_HOURS} h`}
          icon={WifiOff}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip={`Trucks (not in a workshop) that sent no packet at all on the latest day, not even the hourly heartbeat, or whose last report is more than ${SILENT_HOURS} h older than the fleet's latest. A parked truck still heartbeats, so silence usually means a unit, SIM or power fault that needs a service call.`}
        />
      </div>

      <ChartCard
        title={`Completeness Trend by ${groupBy === "model" ? "Model" : "Region"}`}
        subtitle="7-day rolling packets received ÷ expected; dark dashed line = whole fleet, green = 95 % target"
        badge="PERIOD"
        tooltip={`One line per ${groupBy === "model" ? "model" : "region"} (legend ordered weakest first) plus the fleet. A region that dips on its own points at network coverage; a model that sits low points at the telematics hardware or its integration. Below the ${TARGET_PCT}% target the other KPIs for that group become less reliable.`}
        actions={
          <Segmented
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: "region", label: "Region" },
              { value: "model", label: "Model" },
            ]}
          />
        }
      >
        {loading ? (
          <ChartSkeleton />
        ) : trend.data.length === 0 ? (
          <EmptyChart message="No data in this period." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
              <YAxis
                domain={[Math.max(0, Math.floor(Math.min(trendMin, TARGET_PCT) - 2)), 100]}
                unit="%"
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
                width={44}
              />
              <RechartsTooltip
                labelFormatter={(d) => `7 days to ${formatDay(d)}`}
                formatter={(v, name) => [v === null ? "—" : `${v}%`, name]}
                itemSorter={(item) => item.value ?? 101}
              />
              <Legend verticalAlign="bottom" height={32} iconType="plainline" wrapperStyle={LEGEND_STYLE} />
              <ReferenceLine y={TARGET_PCT} stroke="#10b981" strokeDasharray="4 4" />
              {trend.groups.map((g, i) => (
                <Line
                  key={g.id}
                  dataKey={g.id}
                  name={`${g.label} (${g.completeness === null ? "—" : g.completeness.toFixed(1)}%)`}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={1.75}
                  dot={false}
                  connectNulls
                />
              ))}
              <Line dataKey="fleet" name="Fleet" stroke="#0f172a" strokeWidth={2.5} strokeDasharray="6 4" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <DataTable
        title="Connectivity Watchlist"
        tooltip={`Trucks that are silent (no packets on the latest day, or no report for ${SILENT_HOURS} h) or below ${LOW_COMPLETENESS_PCT}% completeness. Hand this list to the connected-services team for unit or SIM checks. Click a row to open the truck.`}
        loading={loading}
        rows={rows}
        rowKey={(r) => r.vehicleId}
        onRowClick={(r) => onOpenAsset(r.vehicleId)}
        emptyMessage="Every truck is reporting normally."
        searchPlaceholder="Search VIN or vehicle"
        searchText={(r) => `${r.vin ?? ""} ${r.vehicleId}`}
        initialSort={{ key: "completeness", dir: "asc" }}
        csvName="connectivity-watchlist.csv"
        toolbar={
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="rounded border-slate-300" />
            Only trucks with an issue
          </label>
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
          {
            key: "completeness",
            label: "Completeness",
            align: "right",
            sortValue: (r) => r.completeness,
            csv: (r) => r.completeness?.toFixed(2),
            render: (r) => (
              <span className={r.completeness !== null && r.completeness < LOW_COMPLETENESS_PCT ? "font-semibold text-amber-600" : ""}>{formatPct(r.completeness)}</span>
            ),
          },
          {
            key: "packets",
            label: "Packets (rcvd / exp)",
            align: "right",
            sortValue: (r) => r.expected - r.received,
            csv: (r) => `${r.received}/${r.expected}`,
            render: (r) => (
              <span className="text-xs">
                {formatNumber(r.received)} / {formatNumber(r.expected)}
              </span>
            ),
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
