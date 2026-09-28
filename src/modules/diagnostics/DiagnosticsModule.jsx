import React from "react";
import {
  Activity,
  Gauge,
  AlertTriangle,
  AlertCircle,
  Clock,
  Bot,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import InfoTooltip from "../../components/ui/InfoTooltip";
import {
  useDiagnosticsData,
  FLEET_MAHALANOBIS_THRESHOLD,
  CRITICAL_Z_SCORE_THRESHOLD,
} from "../../hooks/useDiagnosticsData";
import { useFilterStore } from "../../store/useFilterStore";

const STATUS_STYLES = {
  Critical: "bg-rose-100 text-rose-700",
  Warning: "bg-amber-100 text-amber-700",
  Healthy: "bg-emerald-100 text-emerald-700",
  Unknown: "bg-slate-100 text-slate-500",
};

function ChartCard({ title, tooltip, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      {children}
    </div>
  );
}

function FleetDiagnosticsView({ loading, error, fleetKpis, anomalyScatter, signalDeviation }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 pb-6">
      <div className="border-b border-slate-200 bg-white px-0 py-4">
        <h1 className="text-base font-semibold text-slate-800">
          Fleet-Wide Telematics Diagnostics
        </h1>
      </div>

      <div className="mt-6">
        {error && (
          <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Couldn't load fleet diagnostics: {error.message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Fleet Telematics Health"
            value={`${fleetKpis.telematicsHealthPct.toFixed(1)}%`}
            icon={Activity}
            iconBgClass="bg-emerald-50"
            iconColorClass="text-emerald-600"
            loading={loading}
            tooltip="The percentage of telemetry readings across the fleet that returned a valid (non-null) z-score. A lower number means more sensor dropout or data-quality gaps, not necessarily more mechanical risk."
          />
          <KpiCard
            title="Avg Fleet RUL"
            value={`${Math.round(fleetKpis.avgFleetRul).toLocaleString()} mi`}
            icon={Gauge}
            iconBgClass="bg-sky-50"
            iconColorClass="text-sky-600"
            loading={loading}
            tooltip="The average Remaining Useful Life, in miles, across every vehicle health record currently in scope for the selected region and date range."
          />
          <KpiCard
            title="Active Critical Anomalies"
            value={fleetKpis.activeCriticalAnomalies}
            icon={AlertTriangle}
            iconBgClass="bg-rose-50"
            iconColorClass="text-rose-600"
            loading={loading}
            tooltip={`The count of individual telemetry readings with a z-score above ${CRITICAL_Z_SCORE_THRESHOLD}, the threshold used fleet-wide to flag a single-signal anomaly as critical.`}
          />
          <KpiCard
            title="Total Fleet DTCs"
            value={fleetKpis.totalFleetDtcs}
            icon={AlertCircle}
            iconBgClass="bg-amber-50"
            iconColorClass="text-amber-600"
            loading={loading}
            tooltip="The total number of active Diagnostic Trouble Codes logged across every vehicle currently in scope, regardless of severity."
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Fleet Multivariate Anomaly Scatter"
            tooltip="Plots the Mahalanobis Distance (Y-Axis) over Time (X-Axis) for the entire fleet. Mahalanobis distance measures multivariate signal deviation (e.g. RPM and Temp spiking together). Values above the red line indicate severe fleet-wide anomalies requiring engineering review."
          >
            {loading ? (
              <div className="h-64 w-full animate-pulse rounded bg-slate-100" />
            ) : anomalyScatter.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                No anomaly data in the current filter range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    type="category"
                    name="Date"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    dataKey="mahalanobisScore"
                    name="Mahalanobis Distance"
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} />
                  <ReferenceLine
                    y={FLEET_MAHALANOBIS_THRESHOLD}
                    stroke="#e11d48"
                    strokeDasharray="6 4"
                    label={{ value: "Severe Anomaly", position: "insideTopRight", fontSize: 11, fill: "#e11d48" }}
                  />
                  <Scatter data={anomalyScatter} fill="#0ea5e9" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            title="Signal Deviation by Sensor"
            tooltip="Average Z-Score (Y-Axis) grouped by Telematics Signal Type (X-Axis). Highlights which specific sensors — e.g. Coolant Temp, Vibration — are driving the most variance across the fleet."
          >
            {loading ? (
              <div className="h-64 w-full animate-pulse rounded bg-slate-100" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={signalDeviation}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="signal"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <RechartsTooltip />
                  <Bar dataKey="avgZScore" name="Avg Z-Score" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function AssetDiagnosticsView({
  selectedVin,
  loading,
  error,
  assetKpis,
  assetStatus,
  telemetryPlayback,
  subsystemDeviation,
  healthRecord,
}) {
  const clearSelectedVin = useFilterStore((s) => s.clearSelectedVin);

  return (
    <>
      <div className="mb-6 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">{selectedVin}</span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[assetStatus]}`}
          >
            {assetStatus}
          </span>
        </div>
        <button
          type="button"
          onClick={clearSelectedVin}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
          Clear Asset / Back to Fleet View
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {error && (
          <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Couldn't load diagnostics for {selectedVin}: {error.message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Component Risk Score"
            value={assetKpis.riskScorePct !== null ? `${assetKpis.riskScorePct.toFixed(1)}%` : "—"}
            icon={AlertTriangle}
            iconBgClass="bg-rose-50"
            iconColorClass="text-rose-600"
            loading={loading}
            tooltip="The model's predicted probability of failure for this asset's monitored component, from the most recent health record."
          />
          <KpiCard
            title="Asset RUL"
            value={
              assetKpis.remainingUsefulLife !== null && assetKpis.remainingUsefulLife !== undefined
                ? `${Number(assetKpis.remainingUsefulLife).toLocaleString()} mi`
                : "—"
            }
            icon={Gauge}
            iconBgClass="bg-sky-50"
            iconColorClass="text-sky-600"
            loading={loading}
            tooltip="Remaining Useful Life, in miles, before this specific asset's monitored component is expected to require service."
          />
          <KpiCard
            title="Active Critical DTCs"
            value={assetKpis.activeCriticalDtcCount}
            icon={AlertCircle}
            iconBgClass="bg-amber-50"
            iconColorClass="text-amber-600"
            loading={loading}
            tooltip="The number of currently active Diagnostic Trouble Codes on this asset marked with Critical severity."
          />
          <KpiCard
            title="Last Sync"
            value={assetKpis.lastSyncLabel}
            icon={Clock}
            iconBgClass="bg-violet-50"
            iconColorClass="text-violet-600"
            loading={loading}
            tooltip="Time elapsed since this asset's telematics unit last reported a health record."
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Historical Telemetry Playback (7d)"
            tooltip="Plots the raw signal value (Left Y-Axis) and anomaly Z-Score (Right Y-Axis) over the last 7 days (X-Axis). The red dashed line represents the critical failure threshold. Use this to trace the exact moment the asset's telemetry became erratic."
          >
            {loading ? (
              <div className="h-64 w-full animate-pulse rounded bg-slate-100" />
            ) : telemetryPlayback.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                No telemetry recorded in the last 7 days.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={telemetryPlayback}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    yAxisId="value"
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    label={{ value: "Signal Value", angle: -90, position: "insideLeft", fontSize: 11, fill: "#94a3b8" }}
                  />
                  <YAxis
                    yAxisId="zscore"
                    orientation="right"
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    label={{ value: "Z-Score", angle: 90, position: "insideRight", fontSize: 11, fill: "#94a3b8" }}
                  />
                  <RechartsTooltip />
                  <Legend />
                  <ReferenceLine
                    yAxisId="zscore"
                    y={CRITICAL_Z_SCORE_THRESHOLD}
                    stroke="#e11d48"
                    strokeDasharray="6 4"
                    label={{ value: "Critical Threshold", position: "insideTopRight", fontSize: 11, fill: "#e11d48" }}
                  />
                  <Line
                    yAxisId="value"
                    type="monotone"
                    dataKey="signalValue"
                    name="Signal Value"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="zscore"
                    type="monotone"
                    dataKey="zScore"
                    name="Z-Score"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            title="Subsystem Baseline Deviation"
            tooltip="Compares this specific asset's latest sensor readings (Blue Bar) against the fleet-wide historical baseline (Grey Bar) across various subsystems (X-Axis). Rapidly identifies isolated mechanical deviations."
          >
            {loading ? (
              <div className="h-64 w-full animate-pulse rounded bg-slate-100" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={subsystemDeviation}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="signal"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <RechartsTooltip />
                  <Legend />
                  <Bar dataKey="vehicle" name={selectedVin} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="baseline" name="Fleet Baseline" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <div className="mt-6 rounded-xl bg-slate-900 p-6 text-white shadow-md">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-400">
              <Bot className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-200">Prescriptive Action</h3>
              <p className="mt-1.5 text-sm text-slate-300">
                {loading
                  ? "Analyzing latest diagnostics…"
                  : healthRecord?.ai_prescriptive_action ??
                    "No prescriptive action available for this asset yet."}
              </p>
              <button
                type="button"
                onClick={() => {
                  // Wire this up to your work-order / ticketing system.
                }}
                disabled={loading || !healthRecord?.ai_prescriptive_action}
                className="mt-4 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                Generate Repair Order
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function DiagnosticsModule() {
  const selectedVin = useFilterStore((s) => s.selectedVin);
  const region = useFilterStore((s) => s.region);
  const dateRange = useFilterStore((s) => s.dateRange);

  const {
    mode,
    loading,
    error,
    fleetKpis,
    anomalyScatter,
    signalDeviation,
    healthRecord,
    assetKpis,
    assetStatus,
    telemetryPlayback,
    subsystemDeviation,
  } = useDiagnosticsData({ selectedVin, region, dateRange });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      {mode === "fleet" ? (
        <FleetDiagnosticsView
          loading={loading}
          error={error}
          fleetKpis={fleetKpis}
          anomalyScatter={anomalyScatter}
          signalDeviation={signalDeviation}
        />
      ) : (
        <AssetDiagnosticsView
          selectedVin={selectedVin}
          loading={loading}
          error={error}
          assetKpis={assetKpis}
          assetStatus={assetStatus}
          telemetryPlayback={telemetryPlayback}
          subsystemDeviation={subsystemDeviation}
          healthRecord={healthRecord}
        />
      )}
    </div>
  );
}