import React, { useState, useMemo } from 'react';
import RankedBars from "../../components/ui/RankedBars";

import {
  AlertTriangle,
  Building2,
  HelpCircle,
  PackageCheck,
  Boxes,
} from 'lucide-react';
import KpiCard from "../../components/kpi/KpiCard"; 
import { DataTable } from "../telematics/TelematicsUi";
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
              <RankedBars
                rows={filteredDemandData}
                getLabel={(r) => r.location_name}
                grouped
                segments={[
                  { key: "totalStock", color: "#0ea5e9", name: "On-Hand Stock" },
                  { key: "totalDemand", color: "#ef4444", name: "Projected Demand" },
                ]}
                formatValue={(r) => `${nf.format(r.totalStock)} / ${nf.format(r.totalDemand)}`}
              />
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
              <RankedBars
                rows={regionWiseUrgency}
                getLabel={(r) => r.regionId}
                segments={[
                  { key: "Critical", color: "#ef4444", name: "Critical Stockout" },
                  { key: "Reorder", color: "#f59e0b", name: "Reorder Recommended" },
                  { key: "Healthy", color: "#10b981", name: "Healthy" },
                ]}
                formatValue={(r) => `${nf.format(r.Critical + r.Reorder + r.Healthy)} SKUs`}
                renderDetail={(r) => `Critical ${nf.format(r.Critical)} · Reorder ${nf.format(r.Reorder)} · Healthy ${nf.format(r.Healthy)} SKUs`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Section C: Reorder & Allocation Master Table */}
      <DataTable
        title="Reorder & Allocation Master"
        subtitle="Stock, projected demand and reorder quantity per part and depot"
        tooltip="One row per part × depot: on-hand stock, projected 90-day demand, the recommended reorder quantity and the urgency status. Click a row to filter the charts above to that part."
        loading={loading}
        rows={tableData ?? []}
        rowKey={(r) => r.id}
        onRowClick={onRowClick ? (r) => onRowClick(r) : undefined}
        emptyMessage="No inventory records for the selected region."
        searchPlaceholder="Search part or depot…"
        searchText={(r) => `${r.partName} ${r.locationName}`}
        csvName="reorder-allocation.csv"
        columns={[
          { key: "part", label: "Part Name", sortValue: (r) => r.partName, csv: (r) => r.partName, render: (r) => r.partName },
          { key: "depot", label: "Depot", sortValue: (r) => r.locationName, csv: (r) => r.locationName, render: (r) => r.locationName },
          { key: "stock", label: "On-Hand Stock", align: "right", sortValue: (r) => r.quantity, csv: (r) => r.quantity, render: (r) => nf.format(r.quantity) },
          { key: "demand", label: "90D Demand", align: "right", sortValue: (r) => r.demand, csv: (r) => r.demand, render: (r) => nf.format(r.demand) },
          { key: "reorder", label: "Reorder Qty", align: "right", sortValue: (r) => r.reorderQty, csv: (r) => r.reorderQty, className: "font-semibold text-slate-900", render: (r) => nf.format(r.reorderQty) },
          {
            key: "urgency",
            label: "Urgency Status",
            sortValue: (r) => r.urgency,
            csv: (r) => r.urgency,
            render: (r) => <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${PILL_STYLES[r.urgency]}`}>{r.urgency}</span>,
          },
        ]}
      />
    </div>
  );
}