import React, { useMemo, useState } from "react";
import { Radio, RadioTower, SignalLow, WifiOff } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import { LOW_COMPLETENESS_PCT, SILENT_HOURS, completenessBy, completenessTrend, dataHealthKpis, dataNow } from "./telematicsMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, STATUS_STYLES, formatAgo, formatDay, formatNumber, formatPct, truncateString } from "./telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, Pill, Segmented } from "./TelematicsUi";

const TARGET_PCT = 95;

export default function DataHealthTab({ raw, trucks, loading, onOpenAsset }) {
  const [groupBy, setGroupBy] = useState("region");
  const [onlyIssues, setOnlyIssues] = useState(true);

  const kpis = useMemo(() => dataHealthKpis(raw, trucks), [raw, trucks]);
  const trend = useMemo(() => completenessTrend(raw), [raw]);
  const grouped = useMemo(() => completenessBy(trucks, groupBy), [trucks, groupBy]);
  const now = useMemo(() => dataNow(raw), [raw]);

  const rows = useMemo(
    () =>
      trucks.filter(
        (t) => !onlyIssues || t.status === "Silent" || (t.completeness !== null && t.completeness < LOW_COMPLETENESS_PCT)
      ),
    [trucks, onlyIssues]
  );

  const trendMin = trend.reduce((m, p) => (p.value !== null && p.value < m ? p.value : m), 100);

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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Completeness Trend"
          badge="PERIOD"
          tooltip={`7-day rolling packets received ÷ expected across the scope. The dashed line is the ${TARGET_PCT}% reliability target.`}
        >
          {loading ? (
            <ChartSkeleton />
          ) : trend.length === 0 ? (
            <EmptyChart message="No data in this period." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
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
                <RechartsTooltip labelFormatter={(d) => `7 days to ${formatDay(d)}`} formatter={(v) => [`${v}%`, "Completeness"]} />
                <ReferenceLine y={TARGET_PCT} stroke="#10b981" strokeDasharray="4 4" />
                <Line dataKey="value" stroke="#0ea5e9" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Completeness by Group"
          badge="PERIOD"
          tooltip="Completeness per region, telematics unit source or model, weakest first. Regional gaps point at network coverage; a source or model gap points at the hardware or its integration."
          actions={
            <Segmented
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: "region", label: "Region" },
                { value: "source", label: "Unit source" },
                { value: "model", label: "Model" },
              ]}
            />
          }
        >
          {loading ? (
            <ChartSkeleton />
          ) : grouped.length === 0 ? (
            <EmptyChart message="No trucks in scope." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={grouped} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" unit="%" domain={[Math.max(0, Math.floor(Math.min(...grouped.map((g) => g.completeness)) - 3)), 100]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tickFormatter={(v) => truncateString(v, 20)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <RechartsTooltip cursor={{ fill: "#f8fafc" }} formatter={(v, _n, item) => [`${v}% · ${item.payload.trucks} trucks`, "Completeness"]} />
                <ReferenceLine x={TARGET_PCT} stroke="#10b981" strokeDasharray="4 4" />
                <Bar dataKey="completeness" radius={[0, 3, 3, 0]}>
                  {grouped.map((g) => (
                    <Cell key={g.name} fill={g.completeness < TARGET_PCT ? "#f59e0b" : "#0ea5e9"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

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
          { key: "source", label: "Unit Source", sortValue: (r) => r.telematicsSource, csv: (r) => r.telematicsSource, render: (r) => r.telematicsSource ?? "—" },
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
