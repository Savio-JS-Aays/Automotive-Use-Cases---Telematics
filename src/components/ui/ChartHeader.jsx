import React from "react";
import InfoTooltip from "./InfoTooltip";

export default function ChartHeader({ title, subtitle, tooltip }) {
  return (
    <div className="mb-5 border-b border-slate-100 pb-3">
      <div className="flex items-center gap-1.5">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}
