import React from 'react';
import { BAR_CHART_PROPS, BAR_GRID, BAR_MAX_SIZE, BAR_RADIUS, BAR_X_AXIS, BAR_Y_AXIS, VALUE_LABEL } from "../../components/ui/barStyle";
import DonutBreakdown from "../../components/ui/DonutBreakdown";
import RankedBars from "../../components/ui/RankedBars";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, LabelList } from 'recharts';
import { Factory, HelpCircle, PiggyBank, Receipt, Wallet } from 'lucide-react';
import KpiCard from '../../components/kpi/KpiCard';
import { DataTable } from '../telematics/TelematicsUi';
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

// Prevents long labels from pushing the chart off-screen
const truncateString = (str, num = 18) => {
  if (str?.length > num) return str.slice(0, num) + '...';
  return str;
};

const SUBSYSTEM_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b',
];

function ChartHeader({ title, tooltip }) {
  return (
    <div className="mb-4 flex items-center gap-1.5">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="group relative flex items-center">
        <HelpCircle
          className="h-3.5 w-3.5 cursor-help text-slate-400 transition-colors hover:text-slate-600"
          tabIndex={0}
          aria-label={`About ${title}`}
        />
        <div className="pointer-events-none absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {tooltip}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return <div className="flex h-full items-center justify-center text-sm text-slate-400">{message}</div>;
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
    topCostComponents,
    telematicsCostRisk,
    loading,
    error,
  } = useFinancialData();

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Couldn't load financial data: {error.message ?? 'Unknown error'}.
      </div>
    );
  }

  const dash = '—';

  return (
    <div className="space-y-6 bg-slate-50 min-h-full p-6">
      {/* Section A: KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Projected Exposure"
          value={loading ? dash : fmtCurrency(totalProjectedExposure)}
          icon={Wallet}
          iconBgClass="bg-red-50"
          iconColorClass="text-red-600"
          tooltip="Total projected liability over the next 90 days, normalized to USD."
        />
        <KpiCard
          title="Preventable Loss Savings"
          value={loading ? dash : <span className="text-emerald-600">{fmtCurrency(preventableSavings)}</span>}
          icon={PiggyBank}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          tooltip="Estimated capital saved by replacing high-risk parts predictively (assuming 60% margin)."
        />
        <KpiCard
          title="Avg Cost Per Breakdown"
          value={loading ? dash : fmtCurrency(avgCostPerBreakdown)}
          icon={Receipt}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          tooltip="Historical average cost of a reactive component breakdown (normalized to USD)."
        />
        <KpiCard
          title="Highest Cost Supplier"
          value={loading ? dash : highestCostSupplier?.name ?? dash}
          icon={Factory}
          iconBgClass="bg-blue-50"
          iconColorClass="text-blue-600"
          tooltip="The component supplier currently responsible for the largest share of historical warranty claims."
        />
      </div>

      {/* Section B: 2x2 Visualizations Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <ChartHeader title="Cumulative Financial Risk (90D)" tooltip="Financial liability compounding over the next 90 days." />
          <div className="h-72">
            {loading ? <EmptyState message="Loading…" /> : cumulativeData.length === 0 ? <EmptyState message="No projected exposure." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fecaca" stopOpacity={1} />
                      <stop offset="100%" stopColor="#fef2f2" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={14} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={55} />
                  <RechartsTooltip formatter={(v) => [fmtCurrency(v), 'Cumulative Cost']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="cumulative" name="Cumulative Cost" stroke="#ef4444" strokeWidth={2} fill="url(#riskFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <ChartHeader title="Historical Exposure by Subsystem" tooltip="Financial exposure mapped to vehicle engineering subsystems." />
          <div className="h-72">
            {loading ? <EmptyState message="Loading…" /> : subsystemData.length === 0 ? <EmptyState message="No claims data." /> : (
              <div className="h-full overflow-y-auto pr-1">
                <DonutBreakdown
                  data={subsystemData.map((d, i) => ({ name: d.name, value: d.value, color: SUBSYSTEM_COLORS[i % SUBSYSTEM_COLORS.length] }))}
                  centerLabel="Total exposure"
                  formatValue={fmtCompact}
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <ChartHeader title="Top 5 Cost-Driving Components" tooltip="The specific components accounting for the highest forecasted liability." />
          <div className="h-72">
            {loading ? <EmptyState message="Loading…" /> : topCostComponents?.length === 0 ? <EmptyState message="No cost data." /> : (
              <RankedBars
                rows={topCostComponents}
                getLabel={(r) => r.name}
                valueKey="exposure"
                formatValue={(r) => fmtCurrency(r.exposure)}
              />
            )}
          </div>
        </div>

        {/* Chart 4: Cost by Telematics Signal Impact (NEW) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <ChartHeader title="Cost by Telematics Anomaly" tooltip="Maps the total projected component failure costs to their primary underlying telematics signals." />
          <div className="h-72">
            {loading ? <EmptyState message="Loading…" /> : telematicsCostRisk?.length === 0 ? <EmptyState message="No telematics cost data." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={telematicsCostRisk} {...BAR_CHART_PROPS}>
                  <CartesianGrid {...BAR_GRID} />
                  <XAxis dataKey="signal" {...BAR_X_AXIS} tick={{ ...BAR_X_AXIS.tick, fontSize: 11 }} tickFormatter={truncateString} />
                  <YAxis {...BAR_Y_AXIS} tickFormatter={fmtCompact} width={55} />
                  <RechartsTooltip formatter={(v) => [fmtCurrency(v), 'Associated Cost Risk']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="cost" fill="#f59e0b" radius={BAR_RADIUS} maxBarSize={BAR_MAX_SIZE}>
                    <LabelList dataKey={(d) => fmtCompact(d.cost)} {...VALUE_LABEL} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Section C: Financial Exposure Master Table */}
      <DataTable
        title="Financial Exposure Master"
        subtitle="Projected 90-day demand, unit cost and liability per component"
        tooltip="One row per component: projected 90-day replacement demand × unit cost = total projected liability. Click a row to drill into that component."
        loading={loading}
        rows={tableData}
        rowKey={(r) => r.id}
        onRowClick={onRowClick ? (r) => onRowClick(r) : undefined}
        emptyMessage="No inventory forecasts found."
        searchPlaceholder="Search component…"
        searchText={(r) => r.component}
        initialSort={{ key: "total", dir: "desc" }}
        csvName="financial-exposure.csv"
        columns={[
          { key: "component", label: "Component Name", sortValue: (r) => r.component, csv: (r) => r.component, render: (r) => r.component },
          { key: "demand", label: "Projected 90D Demand", align: "right", sortValue: (r) => r.demand, csv: (r) => r.demand, render: (r) => nf.format(r.demand) },
          { key: "unit", label: "Unit Cost", align: "right", sortValue: (r) => r.unitCost, csv: (r) => r.unitCost, render: (r) => fmtCurrency(r.unitCost) },
          { key: "total", label: "Total Projected Liability", align: "right", sortValue: (r) => r.totalExposure, csv: (r) => r.totalExposure, className: "font-semibold text-slate-900", render: (r) => fmtCurrency(r.totalExposure) },
        ]}
      />
    </div>
  );
}