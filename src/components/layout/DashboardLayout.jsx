import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  Car,
  Cog,
  Truck,
  ShieldCheck,
  ChevronDown,
  X,
} from "lucide-react";
import { useFilterStore } from "../../store/useFilterStore";
import { supabase } from "../../lib/supabaseClient";
import TruckSwitcher from "./TruckSwitcher";
// ---------------------------------------------------------------------------
// Nav configuration — one entry per module.
// ---------------------------------------------------------------------------
const NAV_ITEMS = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
    { label: "Telematics", path: "/telematics-data", icon: Activity },
  { label: "Vehicle Diagnostics", path: "/vehicle-diagnostics", icon: Car },
  { label: "Component Reliability", path: "/component-reliability", icon: Cog },
  //{ label: "Supply Chain", path: "/supply-chain", icon: Truck },
];

const DATE_RANGE_OPTIONS = toOptions(["Last 7 Days", "Last 30 Days", "Last 90 Days"]);

const POWERTRAIN_LABELS = { diesel: "Diesel", bev: "Battery Electric (BEV)" };

function toOptions(values) {
  return values.map((v) => ({ value: v, label: v }));
}

function distinctOptions(rows, valueKey, labelFor, allLabel) {
  const byValue = new Map();
  for (const row of rows) {
    const value = row[valueKey];
    if (value && !byValue.has(value)) byValue.set(value, labelFor(row));
  }
  const options = [...byValue.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label }));
  return [{ value: allLabel, label: allLabel }, ...options];
}

// Filter options come from the connected trucks in v_vehicle_context, so they always match the data.
function useFilterOptions() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let isMounted = true;
    supabase
      .from("v_vehicle_context")
      .select("vehicle_id, vin, region_id, region_name, model_id, model_label, powertrain, application_id, application_name, customer_type")
      .eq("is_connected", true)
      .then(({ data, error }) => {
        if (isMounted && !error) setRows(data ?? []);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return useMemo(
    () => ({
      regions: distinctOptions(rows, "region_id", (r) => r.region_name, "All Regions"),
      models: distinctOptions(rows, "model_id", (r) => r.model_label, "All Models"),
      powertrains: distinctOptions(
        rows,
        "powertrain",
        (r) => POWERTRAIN_LABELS[r.powertrain] ?? r.powertrain,
        "All Powertrains"
      ),
      applications: distinctOptions(rows, "application_id", (r) => r.application_name, "All Applications"),
      customerTypes: distinctOptions(rows, "customer_type", (r) => r.customer_type, "All Customer Types"),
      trucks: [...rows].sort((a, b) => String(a.vin ?? a.vehicle_id).localeCompare(String(b.vin ?? b.vehicle_id))),
    }),
    [rows]
  );
}

// ---------------------------------------------------------------------------
// Reusable sleek select control (Adapted for vertical sidebar)
// ---------------------------------------------------------------------------
function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-slate-700">{label}</label>
      <div className="relative flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-white border border-slate-200 rounded-lg text-base px-3.5 py-2.5 pr-9 text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500"
          strokeWidth={2}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top Navigation Bar (Dark)
// ---------------------------------------------------------------------------
function TopNavigation() {
  return (
    <header className="h-16 shrink-0 bg-[#0b1220] text-slate-300 flex items-center justify-between px-6 z-20">
      <div className="flex items-center gap-8">
        {/* Logo area */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-500/10 text-sky-400">
            <Activity className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <p className="text-base font-semibold text-white">Fleet Pulse</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2 px-4 py-2 text-[15px] font-medium rounded-lg transition-colors",
                  isActive
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-300 hover:bg-white/10 hover:text-white",
                ].join(" ")
              }
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="text-sm text-slate-400 font-medium">
        Fleet Ops Console
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sidebar (White) — Global Filters & Asset View Context
// ---------------------------------------------------------------------------
function FilterSidebar() {
  const dateRange = useFilterStore((s) => s.dateRange);
  const region = useFilterStore((s) => s.region);
  const vehicleModel = useFilterStore((s) => s.vehicleModel);
  const powertrain = useFilterStore((s) => s.powertrain);
  const application = useFilterStore((s) => s.application);
  const customerType = useFilterStore((s) => s.customerType);
  const selectedVin = useFilterStore((s) => s.selectedVin);

  const setDateRange = useFilterStore((s) => s.setDateRange);
  const setRegion = useFilterStore((s) => s.setRegion);
  const setVehicleModel = useFilterStore((s) => s.setVehicleModel);
  const setPowertrain = useFilterStore((s) => s.setPowertrain);
  const setApplication = useFilterStore((s) => s.setApplication);
  const setCustomerType = useFilterStore((s) => s.setCustomerType);
  const clearSelectedVin = useFilterStore((s) => s.clearSelectedVin);

  const { regions, models, powertrains, applications, customerTypes, trucks } = useFilterOptions();
  const setSelectedVin = useFilterStore((s) => s.setSelectedVin);

  const isAssetView = selectedVin !== null;

  return (
    <aside className="w-72 shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col z-10">
      {/* Context Header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-200">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
          {isAssetView ? "Asset View" : "Filters"}
        </h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          {isAssetView
            ? "Filtered to a single asset. Macro filters are paused."
            : "Global filters apply across all dashboard modules."}
        </p>
      </div>

      {/* Filter Controls */}
      <div className="p-5 space-y-5 flex-1 overflow-y-auto">
        <FilterSelect
          label="Date Range"
          value={dateRange}
          onChange={setDateRange}
          options={DATE_RANGE_OPTIONS}
        />

        {isAssetView ? (
          <div className="flex flex-col rounded-lg border border-sky-200 bg-sky-50 p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-sky-400" />
            <span className="text-xs font-semibold text-sky-800 uppercase tracking-wider mb-1">
              Active Vehicle
            </span>
            <TruckSwitcher trucks={trucks} selectedId={selectedVin} onSelect={setSelectedVin} />
            <button
              type="button"
              onClick={clearSelectedVin}
              className="flex items-center justify-center gap-1.5 rounded-md bg-white border border-sky-200 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 transition-colors shadow-sm"
            >
              <X className="h-4 w-4" strokeWidth={2} />
              Clear Asset View
            </button>
          </div>
        ) : (
          <>
            <FilterSelect
              label="Region"
              value={region}
              onChange={setRegion}
              options={regions}
            />
            <FilterSelect
              label="Vehicle Model"
              value={vehicleModel}
              onChange={setVehicleModel}
              options={models}
            />
            <FilterSelect
              label="Powertrain"
              value={powertrain}
              onChange={setPowertrain}
              options={powertrains}
            />
            <FilterSelect
              label="Application"
              value={application}
              onChange={setApplication}
              options={applications}
            />
            <FilterSelect
              label="Customer Type"
              value={customerType}
              onChange={setCustomerType}
              options={customerTypes}
            />
          </>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Layout — Structure: Column (TopNav, Row (Sidebar, Main))
// ---------------------------------------------------------------------------
export default function DashboardLayout({ children }) {
  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans overflow-hidden">
      <TopNavigation />

      <div className="flex flex-1 overflow-hidden">
        <FilterSidebar />

        <main className="flex-1 overflow-y-auto p-8 relative">
          {/* Use <Outlet /> when this layout wraps react-router routes. */}
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}