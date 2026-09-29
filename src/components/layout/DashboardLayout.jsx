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
// ---------------------------------------------------------------------------
// Nav configuration — one entry per module.
// ---------------------------------------------------------------------------
const NAV_ITEMS = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Vehicle Diagnostics", path: "/vehicle-diagnostics", icon: Car },
  { label: "Component Reliability", path: "/component-reliability", icon: Cog },
  { label: "Supply Chain", path: "/supply-chain", icon: Truck },
  { label: "Financial Data", path: "/financial-warranty", icon: ShieldCheck },
];

const DATE_RANGE_OPTIONS = [
  "Today",
  "Last 7 Days",
  "Last 30 Days",
  "Last 90 Days",
  "Year to Date",
];

const REGION_OPTIONS = ["All Regions", "North America", "Europe", "APAC", "LATAM"];

const VEHICLE_MODEL_OPTIONS = [
  "All Models",
  "EV Sedan",
  "EV SUV",
  "Hybrid Van",
  "Diesel Truck",
];

// ---------------------------------------------------------------------------
// Reusable sleek select control (Adapted for vertical sidebar)
// ---------------------------------------------------------------------------
function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-700">{label}</label>
      <div className="relative flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-md text-sm px-3 py-2 pr-8 text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-colors"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-400"
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
    <header className="h-16 shrink-0 bg-slate-900 text-slate-300 flex items-center justify-between px-6 z-20">
      <div className="flex items-center gap-8">
        {/* Logo area */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-500/10 text-sky-400">
            <Activity className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Fleet Pulse</p>
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
                  "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
                ].join(" ")
              }
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="text-xs text-slate-500 font-medium">
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
  const selectedVin = useFilterStore((s) => s.selectedVin);
  
  const setDateRange = useFilterStore((s) => s.setDateRange);
  const setRegion = useFilterStore((s) => s.setRegion);
  const setVehicleModel = useFilterStore((s) => s.setVehicleModel);
  const clearSelectedVin = useFilterStore((s) => s.clearSelectedVin);

  const isAssetView = selectedVin !== null;

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col z-10">
      {/* Context Header */}
      <div className="p-5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">
          {isAssetView ? "Asset View" : "Fleet Overview"}
        </h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          {isAssetView
            ? "Filtered to a single asset. Macro filters are paused."
            : "Global filters apply across all dashboard modules."}
        </p>
      </div>

      {/* Filter Controls */}
      <div className="p-5 space-y-6 flex-1 overflow-y-auto">
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
            <span className="text-base font-bold text-sky-900 mb-4">
              {selectedVin}
            </span>
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
              options={REGION_OPTIONS}
            />
            <FilterSelect
              label="Vehicle Model"
              value={vehicleModel}
              onChange={setVehicleModel}
              options={VEHICLE_MODEL_OPTIONS}
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

        <main className="flex-1 overflow-y-auto p-6 relative">
          {/* Use <Outlet /> when this layout wraps react-router routes. */}
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}