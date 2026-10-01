import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Factory, Microscope, TrendingDown } from "lucide-react";
import { useReliabilityData } from "../../hooks/useReliabilityData";
import { useFilterStore } from "../../store/useFilterStore";
import { buildLifeTable, partSummaries } from "./reliabilityMetrics";
import FieldLifeTab from "./FieldLifeTab";
import SupplierQualityTab from "./SupplierQualityTab";
import RootCauseTab from "./RootCauseTab";
import PartView from "./PartView";

const TABS = [
  { id: "life", label: "Field Life", icon: TrendingDown, component: FieldLifeTab },
  { id: "quality", label: "Supplier & Build Quality", icon: Factory, component: SupplierQualityTab },
  { id: "cause", label: "Root Cause", icon: Microscope, component: RootCauseTab },
];

/**
 * Component Reliability (quality-engineer view). Lifetime part-replacement data of the connected
 * trucks in scope: field life vs design (Kaplan–Meier, Weibull), supplier and build quality, and
 * root cause. `?part=<part_id>` opens the Part View drill-down.
 * Formulas: Documentation/metrics/reliability.md.
 */
export default function ReliabilityModule() {
  const navigate = useNavigate();
  const setSelectedVin = useFilterStore((s) => s.setSelectedVin);
  const [params, setParams] = useSearchParams();
  const tabId = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : TABS[0].id;
  const partId = params.get("part");
  const Tab = TABS.find((t) => t.id === tabId).component;

  const { loading, error, raw } = useReliabilityData();
  const lt = useMemo(() => buildLifeTable(raw), [raw]);
  const summaries = useMemo(() => partSummaries(lt), [lt]);

  const openPart = (id) => {
    setParams({ tab: tabId, part: id });
    document.querySelector("main")?.scrollTo({ top: 0 });
  };
  const closePart = () => setParams({ tab: tabId });
  const openAsset = (vehicleId) => {
    setSelectedVin(vehicleId);
    navigate("/vehicle-diagnostics");
  };

  const shared = { raw, lt, summaries, loading, onOpenPart: openPart, onOpenAsset: openAsset };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-slate-800">Component Reliability</h1>
          <p className="text-xs text-slate-500">
            {loading
              ? "Loading…"
              : `${raw.vehicles.length} connected trucks · ${lt.failures.length.toLocaleString("en-IN")} part replacements since entry into service · lifetime data, the date range does not apply`}
          </p>
        </div>
        {!partId && (
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
        )}
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Couldn't load reliability data: {error.message}</div>
      ) : partId ? (
        <PartView key={partId} partId={partId} onBack={closePart} {...shared} />
      ) : (
        <Tab {...shared} />
      )}
    </div>
  );
}
