import React from "react";
import { Pill } from "../telematics/TelematicsUi";
import { ACTION_STYLES, RISK_STYLES, stateMeta } from "./diagnosticsMetrics";

const LAMP_STYLES = {
  RSL: "bg-rose-100 text-rose-700",
  PL: "bg-violet-100 text-violet-700",
  AWL: "bg-amber-100 text-amber-700",
  MIL: "bg-sky-100 text-sky-700",
};

const SEVERITY_STYLES = {
  critical: "bg-rose-100 text-rose-700",
  major: "bg-amber-100 text-amber-700",
  minor: "bg-slate-100 text-slate-600",
};

export function LampPill({ lamp }) {
  return lamp ? <Pill className={LAMP_STYLES[lamp] ?? "bg-slate-100 text-slate-600"}>{lamp}</Pill> : <span className="text-slate-300">—</span>;
}

export function SeverityPill({ severity }) {
  return severity ? <Pill className={SEVERITY_STYLES[severity] ?? "bg-slate-100 text-slate-600"}>{severity}</Pill> : <span className="text-slate-300">—</span>;
}

export function ActionPill({ action }) {
  return <Pill className={ACTION_STYLES[action] ?? "bg-slate-100 text-slate-600"}>{action}</Pill>;
}

export function RiskPill({ band }) {
  return band ? <Pill className={RISK_STYLES[band]}>{band}</Pill> : <span className="text-slate-300">—</span>;
}

export function StatePill({ state }) {
  const meta = stateMeta(state);
  if (!meta) return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: meta.color }}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

/** Small legend row of coloured dots. */
export function DotLegend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
