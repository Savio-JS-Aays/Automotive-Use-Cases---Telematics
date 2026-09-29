import React, { useState, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
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
import { useSupplyChainData } from '../../hooks/useSupplyChainData'; 

const nf = new Intl.NumberFormat('en-US');
const fmtPct = (n) => `${n.toFixed(1)}%`;

const PILL_STYLES = {
  Critical: 'bg-red-50 text-red-700 border-red-200',
  Reorder: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Healthy: 'bg-green-50 text-green-700 border-green-200',
};

// Truncates long Y-Axis strings with an ellipsis so they don't break the chart layout
const truncateString = (str, num = 22) => {
  if (str?.length > num) return str.slice(0, num) + '...';
  return str;
};

/* ---------- Chart header with Action prop ---------- */
function ChartHeader({ title, tooltip, action }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <div className="group relative">
          <HelpCircle
            className="h-4 w-4 cursor-help text-slate-400 hover:text-slate-600"
            tabIndex={0}
            aria-label={`About ${title}`}
          />
          <div
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {tooltip}
          </div>
        </div>
      </div>
      {action && <div>{action}</div>}
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
    uniqueParts,
    regionWiseUrgency,
    tableData,
    loading,
    error,
  } = useSupplyChainData();

  const [selectedPart, setSelectedPart] = useState("All Components");

  // Locally filter and aggregate the Demand vs Stock data based on the dropdown
  const filteredDemandData = useMemo(() => {
    if (!tableData) return [];
    let data = tableData;
    
    if (selectedPart !== "All Components") {
      data = data.filter(r => r.partName === selectedPart);
    }

    const byLoc = new Map();
    data.forEach(r => {
      const cur = byLoc.get(r.locationName) || { location_name: r.locationName, totalStock: 0, totalDemand: 0 };
      cur.totalStock += r.quantity;
      cur.totalDemand += r.demand;
      byLoc.set(r.locationName, cur);
    });

    // Sort by most demand and limit to top 15
    return Array.from(byLoc.values())
      .sort((a, b) => b.totalDemand - a.totalDemand)
      .slice(0, 15);
  }, [tableData, selectedPart]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Couldn't load supply chain data: {error.message ?? 'Unknown error'}. Check
        your connection and try again.
      </div>
    );
  }

  // Calculate dynamic height for the scrollable chart (min 320px, +60px per location)
  const chartHeight = Math.max(320, filteredDemandData.length * 60);

  return (
    <div className="space-y-6 bg-slate-50 min-h-full p-6">
      
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
        
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <ChartHeader
            title="Depot Demand vs Stock (Top 15)"
            tooltip="Compares current on-hand inventory against projected ML failure demand for the most impacted depots."
            action={
              <select
                value={selectedPart}
                onChange={(e) => setSelectedPart(e.target.value)}
                disabled={loading || uniqueParts?.length === 0}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 max-w-[180px] truncate"
              >
                <option value="All Components">All Components</option>
                {uniqueParts?.map((part) => (
                  <option key={part} value={part}>
                    {part}
                  </option>
                ))}
              </select>
            }
          />
          {/* Scrollable Container with Dynamic Internal Height */}
          <div className="h-[360px] overflow-y-auto overflow-x-hidden pr-2">
            {loading ? (
              <EmptyState message="Loading…" />
            ) : filteredDemandData.length === 0 ? (
              <EmptyState message="No inventory for the selected filters." />
            ) : (
              <div style={{ height: `${chartHeight}px`, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={filteredDemandData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                    barGap={4}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="location_name"
                      tickFormatter={truncateString}
                      tick={{ fontSize: 11, fill: '#475569' }}
                      tickLine={false}
                      axisLine={false}
                      width={150}
                    />
                    <RechartsTooltip
                      cursor={{ fill: '#f8fafc' }}
                      formatter={(v) => nf.format(v)}
                      labelFormatter={(label) => label} 
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingBottom: '10px' }} verticalAlign="top" />
                    <Bar dataKey="totalStock" name="On-Hand Stock" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={12} />
                    <Bar dataKey="totalDemand" name="Projected Demand" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <ChartHeader
            title="Region-Wise Urgency Distribution"
            tooltip="Stacked distribution of inventory SKUs based on predictive reorder thresholds, grouped by geographic region."
          />
          <div className="h-[360px] pr-2">
            {loading ? (
              <EmptyState message="Loading…" />
            ) : regionWiseUrgency?.length === 0 ? (
              <EmptyState message="No regional data available." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={regionWiseUrgency}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                  barSize={24}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="regionId"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: '#f8fafc' }} 
                    formatter={(v, n) => [`${nf.format(v)} SKUs`, n]}
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} 
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingBottom: '10px' }} verticalAlign="top" />
                  <Bar dataKey="Critical" stackId="a" fill="#ef4444" name="Critical Stockout" />
                  <Bar dataKey="Reorder" stackId="a" fill="#f59e0b" name="Reorder Recommended" />
                  <Bar dataKey="Healthy" stackId="a" fill="#10b981" name="Healthy" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Section C: Reorder & Allocation Master Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <PackageX className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">
            Reorder &amp; Allocation Master
          </h3>
          <span className="text-xs text-slate-400">
            {loading ? '' : `${nf.format(tableData?.length || 0)} SKUs`}
          </span>
        </div>

        <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 border-b border-slate-200">Part Name</th>
                <th className="px-5 py-3 border-b border-slate-200">Depot</th>
                <th className="px-5 py-3 border-b border-slate-200 text-right">On-Hand Stock</th>
                <th className="px-5 py-3 border-b border-slate-200 text-right">90D Demand</th>
                <th className="px-5 py-3 border-b border-slate-200 text-right">Reorder Qty</th>
                <th className="px-5 py-3 border-b border-slate-200">Urgency Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : tableData?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                    No inventory records for the selected region.
                  </td>
                </tr>
              ) : (
                tableData?.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className="cursor-pointer transition-colors hover:bg-sky-50 group"
                  >
                    <td className="px-5 py-4 font-medium text-slate-800 group-hover:text-sky-700">
                      {row.partName}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{row.locationName}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                      {nf.format(row.quantity)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                      {nf.format(row.demand)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-900">
                      {nf.format(row.reorderQty)}
                    </td>
                    <td className="px-5 py-4">
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