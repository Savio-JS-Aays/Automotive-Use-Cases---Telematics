import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  HelpCircle,
  PackageCheck,
  PackageX,
  Boxes,
} from 'lucide-react';
import KpiCard from "../../components/kpi/KpiCard";
import {useSupplyChainData} from '../../hooks/useSupplyChainData';

const nf = new Intl.NumberFormat('en-US');
const fmtPct = (n) => `${n.toFixed(1)}%`;

const URGENCY_COLORS = {
  Healthy: '#10b981',
  'Reorder Recommended': '#f59e0b',
  'Critical Stockout': '#ef4444',
};

const PILL_STYLES = {
  Critical: 'bg-red-50 text-red-700 border-red-200',
  Reorder: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Healthy: 'bg-green-50 text-green-700 border-green-200',
};

/* ---------- Chart header with HelpCircle hover tooltip ---------- */
function ChartHeader({ title, tooltip }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="group relative">
        <HelpCircle
          className="h-4 w-4 cursor-help text-slate-400 hover:text-slate-600"
          tabIndex={0}
          aria-label={`About ${title}`}
        />
        <div
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-6 z-20 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {tooltip}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      {message}
    </div>
  );
}

export default function SupplyChainModule({ onRowClick }) {
  const {
    totalDemand,
    availabilityScore,
    depotsInDeficit,
    criticalStockoutRisk,
    regionalChartData,
    urgencyChartData,
    tableData,
    loading,
    error,
  } = useSupplyChainData();

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Couldn't load supply chain data: {error.message ?? 'Unknown error'}. Check
        your connection and try again.
      </div>
    );
  }

  const urgencyTotal = urgencyChartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      {/* Section A: KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Projected Component Demand"
          value={loading ? '—' : nf.format(totalDemand)}
          icon={Boxes}
          iconBgClass="bg-blue-50"
          iconColorClass="text-blue-600"
          tooltip="Total expected unit replacements across the fleet over the next 90 days based on ML failure probabilities."
        />
        <KpiCard
          title="Parts Availability Score"
          value={loading ? '—' : fmtPct(availabilityScore)}
          icon={PackageCheck}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          tooltip="Fleet-wide metric indicating overall supply chain readiness for predictive repairs (Total On-Hand ÷ Total 90-Day Demand)."
        />
        <KpiCard
          title="Depots in Deficit"
          value={loading ? '—' : nf.format(depotsInDeficit)}
          icon={Building2}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          tooltip="Count of regional depots where the 90-day predictive demand exceeds current on-hand and in-transit stock."
        />
        <KpiCard
          title="Critical Stockout Risk"
          value={loading ? '—' : fmtPct(criticalStockoutRisk)}
          icon={AlertTriangle}
          iconBgClass="bg-red-50"
          iconColorClass="text-red-600"
          tooltip="Percentage likelihood of a grounded truck due to zero inventory at the required depot during the supplier lead time."
        />
      </div>

      {/* Section B: Visualizations */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <ChartHeader
            title="Regional Demand vs Stock"
            tooltip="Compares current on-hand inventory against projected ML failure demand, grouped by regional depot."
          />
          <div className="h-80">
            {loading ? (
              <EmptyState message="Loading…" />
            ) : regionalChartData.length === 0 ? (
              <EmptyState message="No inventory for the selected region." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={regionalChartData}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="location_name"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: 'Unit Count',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 12, fill: '#64748b' },
                    }}
                  />
                  <RechartsTooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(v) => nf.format(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="totalStock"
                    name="On-Hand Stock"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="totalDemand"
                    name="Projected Demand"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <ChartHeader
            title="Reorder Urgency Distribution"
            tooltip="Distribution of inventory SKUs based on predictive reorder thresholds."
          />
          <div className="h-80">
            {loading ? (
              <EmptyState message="Loading…" />
            ) : urgencyTotal === 0 ? (
              <EmptyState message="No SKUs to classify." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={urgencyChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {urgencyChartData.map((d) => (
                      <Cell key={d.name} fill={URGENCY_COLORS[d.name]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v, n) => [`${nf.format(v)} SKUs`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Section C: Reorder & Allocation Master Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="mb-4 flex items-center gap-2">
          <PackageX className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">
            Reorder &amp; Allocation Master
          </h3>
          <span className="text-xs text-slate-400">
            {loading ? '' : `${nf.format(tableData.length)} SKUs`}
          </span>
        </div>

        <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Part Name</th>
                <th className="px-4 py-3">Depot</th>
                <th className="px-4 py-3 text-right">On-Hand Stock</th>
                <th className="px-4 py-3 text-right">90D Demand</th>
                <th className="px-4 py-3 text-right">Reorder Qty</th>
                <th className="px-4 py-3">Urgency Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : tableData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No inventory records for the selected region.
                  </td>
                </tr>
              ) : (
                tableData.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {row.partName}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.locationName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {nf.format(row.quantity)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {nf.format(row.demand)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                      {nf.format(row.reorderQty)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${PILL_STYLES[row.urgency]}`}
                      >
                        {row.urgency}
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