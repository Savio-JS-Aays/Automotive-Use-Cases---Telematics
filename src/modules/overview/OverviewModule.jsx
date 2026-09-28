import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  AlertTriangle,
  Gauge,
  Radio,
  Database,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard"; // Ensure this path matches your structure
import { useOverviewData } from "../../hooks/useOverviewData";
import { useFilterStore } from "../../store/useFilterStore";

function RiskScorePill({ score }) {
  return (
    <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">
      {score}
    </span>
  );
}

export default function OverviewModule() {
  const { loading, error, kpis, healthDistribution, alertVolumeTrend, highRiskVehicles } = useOverviewData();
  const setSelectedVin = useFilterStore((s) => s.setSelectedVin);
  const navigate = useNavigate();

  const handleRowClick = (vin) => {
    setSelectedVin(vin);
    navigate("/vehicle-diagnostics");
  };

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Couldn't load overview data: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A: KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Data Quality Trust Score"
          value={`${kpis?.trustScore?.toFixed(1) || 0}%`}
          icon={ShieldCheck}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
        />
        <KpiCard
          title="Active High-Risk Vehicles"
          value={kpis?.highRiskVehicleCount || 0}
          icon={AlertTriangle}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
        />
        <KpiCard
          title="Avg Fleet Daily Utilization"
          value={`${Math.round(kpis?.avgUtilization || 0).toLocaleString()} mi`}
          icon={Gauge}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
        />
        <KpiCard
          title="Top Anomalous Signal"
          value={kpis?.topSignal ?? "—"}
          icon={Radio}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
        />
        <KpiCard
          title="Total Telemetry Events"
          value={(kpis?.totalEvents || 0).toLocaleString()}
          icon={Database}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
        />
      </div>

      {/* Section B: Visualizations */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">
            Fleet Health Status Distribution
          </h3>
          {loading ? (
            <div className="h-64 w-full animate-pulse rounded bg-slate-50" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={healthDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {healthDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip cursor={{ fill: "transparent" }} />
                <Legend verticalAlign="bottom" height={32} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">
            Predictive Alert Volume Trend
          </h3>
          {loading ? (
            <div className="h-64 w-full animate-pulse rounded bg-slate-50" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={alertVolumeTrend}>
                <defs>
                  <linearGradient id="alertVolumeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  dx={-10}
                />
                <RechartsTooltip
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fill="url(#alertVolumeFill)"
                  activeDot={{ r: 6, strokeWidth: 0, fill: "#0ea5e9" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Section C: Master Data Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">High-Risk Vehicle Tracker</h3>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr>
                {["VIN", "Region", "Part ID", "AI Risk Score", "Status"].map((col) => (
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
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-50" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : highRiskVehicles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">
                    No high-risk vehicles match the current filters.
                  </td>
                </tr>
              ) : (
                highRiskVehicles.map((v, i) => (
                  <tr
                    key={`${v.vin}-${i}`}
                    onClick={() => handleRowClick(v.vin)}
                    className="group cursor-pointer transition-colors hover:bg-sky-50"
                  >
                    <td className="px-5 py-4 font-medium text-slate-700 group-hover:text-sky-700">{v.vin}</td>
                    <td className="px-5 py-4 text-slate-500">{v.region}</td>
                    <td className="px-5 py-4 text-slate-500">{v.partId}</td>
                    <td className="px-5 py-4">
                      <RiskScorePill score={v.aiRiskScore} />
                    </td>
                    <td className="px-5 py-4 text-slate-500">{v.status}</td>
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