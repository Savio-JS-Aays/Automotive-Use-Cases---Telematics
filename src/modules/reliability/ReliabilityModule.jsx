import React from "react";
import { Gauge, Target, Wrench, TrendingDown } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import InfoTooltip from "../../components/ui/InfoTooltip";
import { useReliabilityData } from "../../hooks/useReliabilityData";

const SUPPLIER_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#e11d48", "#64748b"];

const HAZARD_STYLES = {
  Critical: "bg-rose-100 text-rose-700",
  Watch: "bg-amber-100 text-amber-700",
  "On Spec": "bg-emerald-100 text-emerald-700",
  "Insufficient Data": "bg-slate-100 text-slate-500",
};

const fmtMiles = (n) => `${Math.round(n).toLocaleString()} mi`;

function fmtSignedMiles(n) {
  const rounded = Math.round(n);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()} mi`;
}

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

function VariancePill({ variance }) {
  if (variance === null || variance === undefined) {
    return <span className="text-slate-300">—</span>;
  }
  const negative = variance < 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        negative ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
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

  const worst = kpis.worstVariance;

  const handleRowClick = () => {
    // Hook up drill-down here (e.g. a part-level detail view) when it exists.
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <h1 className="mb-6 text-base font-semibold text-slate-800">Component Reliability</h1>

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
            <div className="h-64 w-full animate-pulse rounded bg-slate-100" />
          ) : survivalCurve.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              No failure data in the current filter range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={survivalCurve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  label={{ value: "Mileage (mi)", position: "insideBottom", offset: -2, fontSize: 11, fill: "#94a3b8" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <RechartsTooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Line
                  type="stepAfter"
                  dataKey="survival"
                  name="Survival Probability"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Weibull Probability Plot"
          tooltip="Log-log Weibull distribution charting cumulative failure percentages against mileage. Diverging lines indicate significant durability disparities between suppliers."
        >
          {loading ? (
            <div className="h-64 w-full animate-pulse rounded bg-slate-100" />
          ) : weibullRows.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              No failure data in the current filter range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={weibullRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="mileage"
                  type="number"
                  scale="log"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  label={{ value: "Mileage (mi, log scale)", position: "insideBottom", offset: -2, fontSize: 11, fill: "#94a3b8" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <RechartsTooltip
                  labelFormatter={(v) => `${Number(v).toLocaleString()} mi`}
                  formatter={(v) => `${Number(v).toFixed(1)}%`}
                />
                <Legend />
                {weibullSuppliers.map((supplier, i) => (
                  <Line
                    key={supplier}
                    type="monotone"
                    dataKey={supplier}
                    name={supplier}
                    stroke={SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Section C: Master Component Reliability Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
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
                    className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : componentTable.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    No component failures in the current filter range.
                  </td>
                </tr>
              ) : (
                componentTable.map((row) => (
                  <tr
                    key={`${row.partName}-${row.supplierName}`}
                    onClick={handleRowClick}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">{row.partName}</td>
                    <td className="px-4 py-3 text-slate-500">{row.supplierName}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.designB10 !== null ? fmtMiles(row.designB10) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.actualB10 !== null ? fmtMiles(row.actualB10) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <VariancePill variance={row.variance} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${HAZARD_STYLES[row.hazardStatus]}`}
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