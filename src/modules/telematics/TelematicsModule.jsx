import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, Fuel, Radio, ShieldCheck } from "lucide-react";
import { useTelematicsFleetData } from "../../hooks/useTelematicsData";
import { useFilterStore } from "../../store/useFilterStore";
import { truckStats } from "./telematicsMetrics";
import { formatDay } from "./telematicsFormat";
import UtilizationTab from "./UtilizationTab";
import FuelEnergyTab from "./FuelEnergyTab";
import DriverSafetyTab from "./DriverSafetyTab";
import DataHealthTab from "./DataHealthTab";
import AssetTelematicsView from "./AssetTelematicsView";

const TABS = [
  { id: "utilization", label: "Utilization & Uptime", icon: Activity, component: UtilizationTab },
  { id: "fuel", label: "Fuel, Energy & CO₂", icon: Fuel, component: FuelEnergyTab },
  { id: "safety", label: "Driver Safety", icon: ShieldCheck, component: DriverSafetyTab },
  { id: "data", label: "Data Health", icon: Radio, component: DataHealthTab },
];

function FleetTelematicsView() {
  const setSelectedVin = useFilterStore((s) => s.setSelectedVin);
  const [params, setParams] = useSearchParams();
  const tabId = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : TABS[0].id;
  const Tab = TABS.find((t) => t.id === tabId).component;

  const { loading, error, raw } = useTelematicsFleetData();
  const trucks = useMemo(() => truckStats(raw), [raw]);

  const openAsset = (vehicleId) => {
    if (!vehicleId) return;
    setSelectedVin(vehicleId);
    document.querySelector("main")?.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fleet Telematics &amp; Operations</h1>
          <p className="text-xs text-slate-500">
            {raw.period
              ? `${raw.vehicles.length} connected trucks · ${formatDay(raw.period.startStr)} – ${formatDay(raw.period.endStr)} (latest data day)`
              : "Loading…"}
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setParams({ tab: id }, { replace: true })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tabId === id ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Couldn't load telematics data: {error.message}
        </div>
      ) : (
        <Tab raw={raw} trucks={trucks} loading={loading} onOpenAsset={openAsset} />
      )}
    </div>
  );
}

/**
 * Telematics module. Fleet View = four tabs over the connected trucks in scope; Asset View
 * (selectedVin set) = one truck's trips, events and 5-minute day trace.
 * Formulas: Documentation/metrics/telematics.md.
 */
export default function TelematicsModule() {
  const selectedVin = useFilterStore((s) => s.selectedVin);
  return selectedVin ? <AssetTelematicsView key={selectedVin} vehicleId={selectedVin} /> : <FleetTelematicsView />;
}
