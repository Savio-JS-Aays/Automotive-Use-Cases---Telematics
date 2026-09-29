import React from "react";
import {
  Activity,
  Gauge,
  AlertTriangle,
  AlertCircle,
  Clock,
  Bot,
  X,
  HelpCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard"; // Ensure path matches your project
import {
  useDiagnosticsData,
  FLEET_MAHALANOBIS_THRESHOLD,
  CRITICAL_Z_SCORE_THRESHOLD,
} from "../../hooks/useDiagnosticsData";
import { useFilterStore } from "../../store/useFilterStore";

const STATUS_STYLES = {
  Critical: "bg-rose-100 text-rose-700 border-rose-200",
  Warning: "bg-amber-100 text-amber-700 border-amber-200",
  Healthy: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Unknown: "bg-slate-100 text-slate-500 border-slate-200",
};

const CHART_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981", "#64748b"];

function ChartHeader({ title, tooltip }) {
  return (
    <div className="mb-4 flex items-center gap-1.5">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {tooltip && (
        <div className="group relative flex items-center">
          <HelpCircle className="h-3.5 w-3.5 cursor-help text-slate-400 transition-colors hover:text-slate-600" />
          <div className="pointer-events-none absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, tooltip, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <ChartHeader title={title} tooltip={tooltip} />
      {children}
    </div>
  );
}

function formatDateTick(tickItem) {
  const d = new Date(tickItem);
  return Number.isNaN(d.getTime()) ? tickItem : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FleetDiagnosticsView({ loading, error, fleetKpis, anomalyScatter, signalDeviation, fleetSignalAverages, vehicleTableData }) {
  const setSelectedVin = useFilterStore((s) => s.setSelectedVin);

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-base font-bold text-slate-800">Fleet-Wide Telematics Diagnostics</h1>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Couldn't load fleet diagnostics: {error.message}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Fleet Telematics Health"
          value={`${fleetKpis.telematicsHealthPct.toFixed(1)}%`}
          icon={Activity}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Percentage of telemetry readings returning valid (non-null) data. Lower numbers indicate sensor dropout."
        />
        <KpiCard
          title="Avg Fleet RUL"
          value={`${Math.round(fleetKpis.avgFleetRul).toLocaleString()} mi`}
          icon={Gauge}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="The average Remaining Useful Life (miles) across all active vehicle health records in scope."
        />
        <KpiCard
          title="Active Critical Anomalies"
          value={fleetKpis.activeCriticalAnomalies.toLocaleString()}
          icon={AlertTriangle}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip={`Count of individual telemetry readings with a Z-Score > ${CRITICAL_Z_SCORE_THRESHOLD}.`}
        />
        <KpiCard
          title="Total Fleet DTCs"
          value={fleetKpis.totalFleetDtcs.toLocaleString()}
          icon={AlertCircle}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="Total number of active Diagnostic Trouble Codes logged across all in-scope vehicles."
        />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard
            title="Fleet Multivariate Anomaly Scatter"
            tooltip="Plots Mahalanobis Distance (Y-Axis) over Time (X-Axis). Values above the red line indicate severe multivariate anomalies (e.g., Temp and RPM spiking simultaneously)."
          >
            {loading ? (
              <div className="h-64 w-full animate-pulse rounded bg-slate-50" />
            ) : anomalyScatter.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-400">No anomaly data found.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    type="category"
                    tickFormatter={formatDateTick}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    minTickGap={30}
                    dy={10}
                  />
                  <YAxis
                    dataKey="mahalanobisScore"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                  <ReferenceLine
                    y={FLEET_MAHALANOBIS_THRESHOLD}
                    stroke="#e11d48"
                    strokeDasharray="6 4"
                    label={{ value: "Severe Threshold", position: "insideTopRight", fontSize: 11, fill: "#e11d48" }}
                  />
                  <Scatter data={anomalyScatter} fill="#0ea5e9" fillOpacity={0.5} line={false} shape="circle" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <ChartCard
          title="Signal Deviation by Sensor"
          tooltip="Average Z-Score grouped by Signal Type. Red indicates severe positive deviation, blue indicates negative baseline deviation."
        >
          {loading ? (
            <div className="h-64 w-full animate-pulse rounded bg-slate-50" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={signalDeviation} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="signal" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <RechartsTooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                <ReferenceLine y={0} stroke="#cbd5e1" />
                <Bar dataKey="avgZScore" radius={[4, 4, 0, 0]}>
                  {signalDeviation.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.avgZScore < 0 ? "#3b82f6" : entry.avgZScore > CRITICAL_Z_SCORE_THRESHOLD ? "#e11d48" : "#f59e0b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Fleet-Wide Signal Averages"
          tooltip="Average raw sensor values across the entire fleet to establish baseline operating norms."
        >
          {loading ? (
            <div className="h-64 w-full animate-pulse rounded bg-slate-50" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart layout="vertical" data={fleetSignalAverages} margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis type="category" dataKey="signal" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <RechartsTooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                <Bar dataKey="avgValue" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Vehicle Telematics Master Table */}
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Vehicle Telematics Master</h3>
            <ChartHeader tooltip="Vehicle-by-vehicle breakdown of telematics frequency and anomaly counts. Click a row to drill down into the specific asset." />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  {["VIN", "Total Signals", "Deviations (>3 Z-Score)", "Avg Z-Score"].map((col) => (
                    <th key={col} className="border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">Loading...</td></tr>
                ) : vehicleTableData.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">No vehicle data available.</td></tr>
                ) : (
                  vehicleTableData.map((row) => (
                    <tr
                      key={row.vin}
                      onClick={() => setSelectedVin(row.vin)}
                      className="group cursor-pointer transition-colors hover:bg-sky-50"
                    >
                      <td className="px-5 py-3 font-medium text-slate-700 group-hover:text-sky-700">{row.vin}</td>
                      <td className="px-5 py-3 text-slate-600">{row.totalSignals.toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.deviations > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                          {row.deviations.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-700">{row.avgZScore}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssetDiagnosticsView({ selectedVin, loading, error, assetKpis, assetStatus, telemetryPlayback, subsystemDeviation, signalDistribution, healthRecord }) {
  const clearSelectedVin = useFilterStore((s) => s.clearSelectedVin);

  // Sort distribution data so the longest bar is always at the top
  const sortedDistribution = [...signalDistribution].sort((a, b) => b.value - a.value);

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-base font-bold text-slate-800">{selectedVin}</span>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${STATUS_STYLES[assetStatus]}`}>
            {assetStatus}
          </span>
        </div>
        <button
          type="button"
          onClick={clearSelectedVin}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
          Back to Fleet View
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-6">
        {error && (
          <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Couldn't load diagnostics for {selectedVin}: {error.message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Risk Score" value={assetKpis.riskScorePct !== null ? `${assetKpis.riskScorePct.toFixed(1)}%` : "—"} icon={AlertTriangle} iconBgClass="bg-rose-50" iconColorClass="text-rose-600" loading={loading} tooltip="Predicted probability of failure for this asset." />
          <KpiCard title="Asset RUL" value={assetKpis.remainingUsefulLife ? `${Number(assetKpis.remainingUsefulLife).toLocaleString()} mi` : "—"} icon={Gauge} iconBgClass="bg-sky-50" iconColorClass="text-sky-600" loading={loading} tooltip="Remaining miles before component service is required." />
          <KpiCard title="Critical DTCs" value={assetKpis.activeCriticalDtcCount} icon={AlertCircle} iconBgClass="bg-amber-50" iconColorClass="text-amber-600" loading={loading} tooltip="Number of active Critical Diagnostic Trouble Codes." />
          <KpiCard title="Last Sync" value={assetKpis.lastSyncLabel} icon={Clock} iconBgClass="bg-violet-50" iconColorClass="text-violet-600" loading={loading} tooltip="Time elapsed since last telematics ping." />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Latest Telemetry Playback (200 records)" tooltip="Plots raw signal value and anomaly Z-Score for the most recent 200 packets to trace erratic behavior.">
              {loading ? <div className="h-64 w-full animate-pulse rounded bg-slate-50" /> : telemetryPlayback.length === 0 ? <div className="flex h-64 items-center justify-center text-sm text-slate-400">No recent telemetry.</div> : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={telemetryPlayback} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} minTickGap={30} dy={10} />
                    <YAxis yAxisId="value" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                    <YAxis yAxisId="zscore" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    <ReferenceLine yAxisId="zscore" y={CRITICAL_Z_SCORE_THRESHOLD} stroke="#e11d48" strokeDasharray="6 4" />
                    <Line yAxisId="value" type="monotone" dataKey="signalValue" name="Signal Value" stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                    <Line yAxisId="zscore" type="monotone" dataKey="zScore" name="Z-Score" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Signal Frequency Distribution" tooltip="Distribution of telematics packets transmitted by this asset, highlighting sensor reporting frequency.">
            {loading ? <div className="h-64 w-full animate-pulse rounded bg-slate-50" /> : sortedDistribution.length === 0 ? <div className="flex h-64 items-center justify-center text-sm text-slate-400">No signal data.</div> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart layout="vertical" data={sortedDistribution} margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} width={80} />
                  <RechartsTooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                  <Bar dataKey="value" name="Ping Count" radius={[0, 4, 4, 0]} barSize={24}>
                    {sortedDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="lg:col-span-3">
            <ChartCard title="Subsystem Baseline Deviation" tooltip="Compares this specific asset's latest sensor readings against the fleet-wide historical baseline.">
              {loading ? <div className="h-64 w-full animate-pulse rounded bg-slate-50" /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={subsystemDeviation} barSize={20} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="signal" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} dy={10} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                    <RechartsTooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="vehicle" name={selectedVin} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="baseline" name="Fleet Baseline" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-slate-900 p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 -mr-12 -mt-12 h-64 w-64 pointer-events-none rounded-full bg-sky-500 opacity-5 blur-3xl"></div>
          <div className="relative z-10 flex items-start gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/20 text-sky-400">
              <Bot className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-slate-100">AI Prescriptive Action</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
                {loading ? "Analyzing latest telemetry diagnostics..." : healthRecord?.ai_prescriptive_action ?? "No prescriptive action available for this asset yet. Telemetry appears stable."}
              </p>
              <button
                type="button"
                disabled={loading || !healthRecord?.ai_prescriptive_action}
                className="mt-5 rounded-md bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                Generate Repair Order
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DiagnosticsModule() {
  const selectedVin = useFilterStore((s) => s.selectedVin);
  const region = useFilterStore((s) => s.region);
  const dateRange = useFilterStore((s) => s.dateRange);

  const {
    mode, loading, error,
    fleetKpis, anomalyScatter, signalDeviation, fleetSignalAverages, vehicleTableData,
    healthRecord, assetKpis, assetStatus, telemetryPlayback, subsystemDeviation, signalDistribution
  } = useDiagnosticsData({ selectedVin, region, dateRange });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      {mode === "fleet" ? (
        <FleetDiagnosticsView
          loading={loading} error={error}
          fleetKpis={fleetKpis} anomalyScatter={anomalyScatter} signalDeviation={signalDeviation}
          fleetSignalAverages={fleetSignalAverages} vehicleTableData={vehicleTableData}
        />
      ) : (
        <AssetDiagnosticsView
          selectedVin={selectedVin} loading={loading} error={error}
          assetKpis={assetKpis} assetStatus={assetStatus} telemetryPlayback={telemetryPlayback}
          subsystemDeviation={subsystemDeviation} signalDistribution={signalDistribution} healthRecord={healthRecord}
        />
      )}
    </div>
  );
}