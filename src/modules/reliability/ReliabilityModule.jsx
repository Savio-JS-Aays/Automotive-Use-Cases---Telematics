import React, { useState, useEffect } from "react";
import { Gauge, Target, Wrench, TrendingDown, HelpCircle } from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard"; // Ensure this path is correct
import { useReliabilityData } from "../../hooks/useReliabilityData";

const HAZARD_STYLES = {
  Critical: "bg-rose-100 text-rose-700 border-rose-200",
  Watch: "bg-amber-100 text-amber-700 border-amber-200",
  "On Spec": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Insufficient Data": "bg-slate-100 text-slate-500 border-slate-200",
};

const fmtMiles = (n) => `${Math.round(n).toLocaleString()} mi`;

function fmtSignedMiles(n) {
  const rounded = Math.round(n);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()} mi`;
}

function ChartHeader({ title, tooltip, action }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
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
      {action && <div>{action}</div>}
    </div>
  );
}

function ChartCard({ title, tooltip, action, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <ChartHeader title={title} tooltip={tooltip} action={action} />
      {children}
    </div>
  );
}

function VariancePill({ variance }) {
  if (variance === null || variance === undefined) {
    return <span className="text-slate-300">—</span>;
  }
  const negative = variance < 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
        negative ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
      }`}
    >
      {fmtSignedMiles(variance)}
    </span>
  );
}

export default function ReliabilityModule() {
  const {
    loading,
    error,
    kpis,
    survivalCurve,
    weibullRows,
    weibullSuppliers,
    componentTable,
  } = useReliabilityData();

  // Local state for the Supplier Dropdown in the Weibull Plot
  const [selectedSupplier, setSelectedSupplier] = useState("");

  // Keep dropdown default synced to data load
  useEffect(() => {
    if (weibullSuppliers.length > 0 && (!selectedSupplier || !weibullSuppliers.includes(selectedSupplier))) {
      setSelectedSupplier(weibullSuppliers[0]);
    }
  }, [weibullSuppliers, selectedSupplier]);

  const worst = kpis.worstVariance;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-base font-bold text-slate-800">Component Reliability</h1>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Couldn't load reliability data: {error.message}
        </div>
      )}

      {/* Section A: KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Fleet Average RUL"
          value={kpis.fleetAvgRul !== null ? fmtMiles(kpis.fleetAvgRul) : "—"}
          icon={Gauge}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="The mean Remaining Useful Life (RUL) extrapolated across all active vehicle components, indicating the average mileage left before expected failure."
        />
        <KpiCard
          title="Actual B10 Life Expectancy"
          value={kpis.actualB10 !== null ? fmtMiles(kpis.actualB10) : "—"}
          icon={Target}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip="The precise mileage at which 10% of the active component population is statistically expected to fail, calculated from historical warranty claims."
        />
        <KpiCard
          title="Top Failing Component"
          value={kpis.topFailing ? kpis.topFailing.name : "—"}
          icon={Wrench}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="The component category currently exhibiting the steepest survival curve drop-off and highest instantaneous hazard rate."
        />
        <KpiCard
          title="Supplier Variance Risk"
          value={
            worst ? (
              <span className={worst.variance < 0 ? "text-rose-600" : "text-emerald-600"}>
                {fmtSignedMiles(worst.variance)}
              </span>
            ) : (
              "—"
            )
          }
          icon={TrendingDown}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip="Indicates whether a specific supplier's batches are failing earlier than the OEM baseline engineering design specifications."
        />
      </div>

      {worst && !loading && (
        <p className="mt-2 text-xs text-slate-400">
          Supplier variance shown for {worst.supplierName} · {worst.partName}
        </p>
      )}

      {/* Section B: Visualizations */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Component Survival Curve"
          tooltip="Kaplan-Meier survival function S(t). Plots the probability of a component surviving without failure as vehicle mileage accumulates."
        >
          {loading ? (
            <div className="h-64 w-full animate-pulse rounded bg-slate-50" />
          ) : survivalCurve.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              No failure data in the current filter range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={survivalCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="survivalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <RechartsTooltip 
                  formatter={(v) => `${Number(v).toFixed(1)}%`}
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                />
                <Area
                  type="monotone"
                  dataKey="survival"
                  name="Survival Probability"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#survivalFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Weibull Probability Plot"
          tooltip="Log-log Weibull distribution charting cumulative failure percentages against mileage for individual suppliers."
          action={
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              disabled={loading || weibullSuppliers.length === 0}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {weibullSuppliers.length === 0 ? (
                <option value="">No Suppliers</option>
              ) : (
                weibullSuppliers.map((supplier) => (
                  <option key={supplier} value={supplier}>
                    {supplier}
                  </option>
                ))
              )}
            </select>
          }
        >
          {loading ? (
            <div className="h-64 w-full animate-pulse rounded bg-slate-50" />
          ) : weibullRows.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              No failure data in the current filter range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={weibullRows} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="mileage"
                  type="number"
                  scale="log"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <RechartsTooltip
                  labelFormatter={(v) => `${Number(v).toLocaleString()} mi`}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, selectedSupplier]}
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                />
                {selectedSupplier && (
                  <Line
                    type="monotone"
                    dataKey={selectedSupplier}
                    name={selectedSupplier}
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Section C: Master Component Reliability Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Component Variance Master</h3>
          <ChartHeader tooltip="Actuarial table listing components, actual calculated B10 lifespan, and deviation from OEM design specs." />
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr>
                {[
                  "Component Name",
                  "Supplier",
                  "B10 Design Life",
                  "Actual B10 Life",
                  "Variance",
                  "Hazard Status",
                ].map((col) => (
                  <th
                    key={col}
                    className="border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-400"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-50" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : componentTable.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">
                    No component failures in the current filter range.
                  </td>
                </tr>
              ) : (
                componentTable.map((row) => (
                  <tr
                    key={`${row.partName}-${row.supplierName}`}
                    className="group cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-medium text-slate-700 group-hover:text-sky-700">{row.partName}</td>
                    <td className="px-5 py-4 text-slate-500">{row.supplierName}</td>
                    <td className="px-5 py-4 text-slate-500">
                      {row.designB10 !== null ? fmtMiles(row.designB10) : "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {row.actualB10 !== null ? fmtMiles(row.actualB10) : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <VariancePill variance={row.variance} />
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${HAZARD_STYLES[row.hazardStatus]}`}
                      >
                        {row.hazardStatus}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}