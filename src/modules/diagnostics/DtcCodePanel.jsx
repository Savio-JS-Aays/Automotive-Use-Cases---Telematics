import React, { useEffect } from "react";
import { ArrowUpRight, ListFilter, X } from "lucide-react";
import { formatDateTime, formatNumber } from "../telematics/telematicsFormat";
import { LampPill, SeverityPill } from "./diagnosticsUi";
import { faultName, systemLabel } from "./diagnosticsMetrics";

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h4>
      {children}
    </section>
  );
}

/** Side drawer with everything about one J1939 fault code (opened from Most Common Faults). */
export default function DtcCodePanel({ detail, onClose, onOpenAsset, onOpenPart, onFilterTable }) {
  const { dim } = detail;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const maxModel = Math.max(1, ...detail.byModel.map((m) => m.count));
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {detail.dtcId} · SPN {dim.spn} / FMI {dim.fmi}
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-slate-800">{faultName({ dtc_id: detail.dtcId, dim_dtc: dim })}</h3>
            <p className="text-xs text-slate-500">
              {dim.spn_description}: {dim.fmi_description}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <LampPill lamp={dim.default_lamp} />
            <SeverityPill severity={dim.severity_class} />
            <span className="text-xs text-slate-500">{systemLabel(dim.system)}</span>
            <span className="text-xs text-slate-400">· ECU {dim.ecu_name ?? "—"}</span>
            {dim.can_derate && <span className="text-xs font-semibold text-rose-600">· can derate</span>}
            {detail.intermittent && <span className="text-xs text-slate-400">· intermittent (self-heals)</span>}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["In period", detail.periodCount],
              ["Active now", detail.activeCount],
              ["Trucks", detail.truckCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-2 py-2">
                <p className="text-lg font-bold text-slate-800">{value}</p>
                <p className="text-[11px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <Section title="Recommended action">
            <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-slate-700">{dim.recommended_action ?? "—"}</p>
            {detail.activeCount > 0 && (
              <button type="button" onClick={onFilterTable} className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline">
                <ListFilter className="h-3.5 w-3.5" /> Show active trucks in the fault list
              </button>
            )}
          </Section>

          {detail.parts.length > 0 && (
            <Section title="Likely parts">
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {detail.parts.map((p) => (
                  <li key={p.partId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div>
                      <p className="font-medium text-slate-700">{p.partName}</p>
                      <p className="text-[11px] text-slate-400">
                        likelihood {(p.likelihood * 100).toFixed(0)}% · {formatNumber(p.stock)} in stock in scope regions
                      </p>
                    </div>
                    <button type="button" onClick={() => onOpenPart(p.partId)} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-sky-700 hover:underline">
                      Reliability <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {detail.byModel.length > 0 && (
            <Section title="By model (active + period)">
              <div className="space-y-1.5">
                {detail.byModel.map((m) => (
                  <div key={m.label} className="flex items-center gap-2 text-xs">
                    <span className="w-40 shrink-0 truncate text-slate-600">{m.label}</span>
                    <div className="h-2 flex-1 rounded bg-slate-100">
                      <div className="h-2 rounded bg-sky-500" style={{ width: `${(m.count / maxModel) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right tabular-nums text-slate-500">{m.count}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {detail.freezeFrame.length > 0 && (
            <Section title="Freeze frame (mean at fault)">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {detail.freezeFrame.map((f) => (
                  <React.Fragment key={f.key}>
                    <dt className="text-slate-500">{f.label}</dt>
                    <dd className="text-right tabular-nums text-slate-700">{formatNumber(f.mean, 1)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </Section>
          )}

          <Section title="Affected trucks">
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {detail.trucks.map((t) => (
                <li key={t.vehicleId}>
                  <button type="button" onClick={() => onOpenAsset(t.vehicleId)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-sky-50">
                    <div>
                      <p className="font-medium text-slate-700">{t.vin}</p>
                      <p className="text-[11px] text-slate-400">
                        {t.modelLabel} · first seen {formatDateTime(t.firstSeen)}
                      </p>
                    </div>
                    <span className="text-[11px] capitalize text-slate-500">{t.status.replace("_", " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </aside>
    </div>
  );
}
