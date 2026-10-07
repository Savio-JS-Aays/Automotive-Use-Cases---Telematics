import React from "react";
import { useSearchParams } from "react-router-dom";
import { AlertOctagon, Waves } from "lucide-react";
import { useDiagnosticsFleetData, useSignalHealthData } from "../../hooks/useDiagnosticsData";
import { useFilterStore } from "../../store/useFilterStore";
import { formatDay } from "../telematics/telematicsFormat";
import FaultCodesTab from "./FaultCodesTab";
import SignalHealthTab from "./SignalHealthTab";
import AssetDiagnosticsView from "./AssetDiagnosticsView";

const TABS = [
  { id: "faults", label: "Fault Codes (DTC)", icon: AlertOctagon },
  { id: "signals", label: "Signal Health", icon: Waves },
];

function FleetDiagnosticsView() {
  const setSelectedVin = useFilterStore((s) => s.setSelectedVin);
  const [params, setParams] = useSearchParams();
  const tabId = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : TABS[0].id;

  const { loading, error, raw } = useDiagnosticsFleetData();
  const signalHealth = useSignalHealthData(raw, tabId === "signals" && !loading);

  const openAsset = (vehicleId, signalCode) => {
    if (!vehicleId) return;
    const next = new URLSearchParams(params);
    if (signalCode) next.set("signal", signalCode);
    else next.delete("signal");
    setParams(next, { replace: true });
    setSelectedVin(vehicleId);
    document.querySelector("main")?.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vehicle Diagnostics</h1>
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
          Couldn't load diagnostics: {error.message}
        </div>
      ) : tabId === "faults" ? (
        <FaultCodesTab raw={raw} loading={loading} onOpenAsset={openAsset} />
      ) : (
        <SignalHealthTab raw={raw} loading={loading} signalHealth={signalHealth} onOpenAsset={openAsset} />
      )}
    </div>
  );
}

/**
 * Vehicle Diagnostics (service-engineer view). Fleet View = Fault Codes and Signal Health tabs
 * over the connected trucks in scope; Asset View (selectedVin set) = one truck's signals, faults,
 * predictions, service history and workshop prep. Formulas: Documentation/metrics/diagnostics.md.
 */
export default function DiagnosticsModule() {
  const selectedVin = useFilterStore((s) => s.selectedVin);
  return selectedVin ? <AssetDiagnosticsView key={selectedVin} vehicleId={selectedVin} /> : <FleetDiagnosticsView />;
}
