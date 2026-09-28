import React from 'react';
import {
  Area,
  AreaChart,
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
  Factory,
  HelpCircle,
  PiggyBank,
  Receipt,
  TableProperties,
  Wallet,
} from 'lucide-react';
// IMPORT FIXES: Corrected nested relative paths and named hook import
import KpiCard from '../../components/kpi/KpiCard'; 
import { useFinancialData } from '../../hooks/useFinancialData'; 

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const fmtCurrency = (n) => currencyFmt.format(Math.round(Number(n) || 0));
const fmtCompact = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
};
const nf = new Intl.NumberFormat('en-US');

const SUBSYSTEM_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#64748b',
];

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

export default function FinancialModule({ onRowClick }) {
  const {
    totalProjectedExposure,
    preventableSavings,
    avgCostPerBreakdown,
    highestCostSupplier,
    subsystemData,
    cumulativeData,
    tableData,
    loading,
    error,
  } = useFinancialData();

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Couldn't load financial data: {error.message ?? 'Unknown error'}. Check your
        connection and try again.
      </div>
    );
  }

  const dash = '—';

  return (
    <div className="space-y-6 bg-slate-50 min-h-full p-6">
      {/* Section A: KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Projected Exposure"
          value={loading ? dash : fmtCurrency(totalProjectedExposure)}
          icon={Wallet}
          iconBgClass="bg-red-50"
          iconColorClass="text-red-600"
          tooltip="Total projected liability over the next 90 days, calculated by multiplying predicted component failures by their respective unit replacement costs."
        />
        <KpiCard
          title="Preventable Loss Savings"
          value={
            loading ? (
              dash
            ) : (
              <span className="text-emerald-600">{fmtCurrency(preventableSavings)}</span>
            )
          }
          icon={PiggyBank}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          tooltip="Estimated capital saved by replacing high-risk parts predictively rather than waiting for catastrophic reactive breakdowns (assuming 60% margin)."
        />
        <KpiCard
          title="Avg Cost Per Breakdown"
          value={loading ? dash : fmtCurrency(avgCostPerBreakdown)}
          icon={Receipt}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          tooltip="Historical average cost of a reactive component breakdown including emergency towing, rush labor, and collateral damage."
        />
        <KpiCard
          title="Highest Cost Supplier"
          value={loading ? dash : highestCostSupplier?.name ?? dash}
          icon={Factory}
          iconBgClass="bg-blue-50"
          iconColorClass="text-blue-600"
          tooltip="The component supplier currently responsible for the largest slice of historical warranty claim payouts."
        />
      </div>

      {/* Section B: Visualizations */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <ChartHeader
            title="Cumulative Financial Risk (90D)"
            tooltip="Visualizes how financial liability compounds over the next 90 days as predicted component failures mature into actual breakdowns."
          />
          <div className="h-80">
            {loading ? (
              <EmptyState message="Loading…" />
            ) : cumulativeData.length === 0 ? (
              <EmptyState message="No projected exposure for the current filters." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={cumulativeData}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fecaca" stopOpacity={1} />
                      <stop offset="100%" stopColor="#fef2f2" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    interval={14}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmtCompact}
                    width={60}
                  />
                  <RechartsTooltip
                    formatter={(v) => [fmtCurrency(v), 'Cumulative Cost']}
                    labelStyle={{ color: '#334155' }}
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    name="Cumulative Cost"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#riskFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <ChartHeader
            title="Historical Exposure by Subsystem"
            tooltip="Financial exposure breakdown mapped to vehicle engineering subsystems to identify core architectural vulnerabilities."
          />
          <div className="h-80">
            {loading ? (
              <EmptyState message="Loading…" />
            ) : subsystemData.length === 0 ? (
              <EmptyState message="No warranty claims for the current filters." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={subsystemData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {subsystemData.map((d, i) => (
                      <Cell
                        key={d.name}
                        fill={SUBSYSTEM_COLORS[i % SUBSYSTEM_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(v, n) => [fmtCurrency(v), n]} 
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Section C: Financial Exposure Master Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <TableProperties className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">
            Financial Exposure Master
          </h3>
          <span className="text-xs text-slate-400">
            {loading ? '' : `${nf.format(tableData.length)} components`}
          </span>
        </div>

        <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="border-b border-slate-200 px-4 py-3">Component Name</th>
                <th className="border-b border-slate-200 px-4 py-3 text-right">Projected 90D Demand</th>
                <th className="border-b border-slate-200 px-4 py-3 text-right">Unit Cost</th>
                <th className="border-b border-slate-200 px-4 py-3 text-right">Total Projected Liability ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : tableData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    No inventory forecasts for the selected region.
                  </td>
                </tr>
              ) : (
                tableData.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className="cursor-pointer transition-colors hover:bg-sky-50"
                  >
                    <td className="px-4 py-4 font-medium text-slate-800">
                      {row.component}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-700">
                      {nf.format(row.demand)}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-700">
                      {fmtCurrency(row.unitCost)}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums font-semibold text-slate-900">
                      {fmtCurrency(row.totalExposure)}
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