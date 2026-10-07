import React from "react";
import InfoTooltip from "./InfoTooltip";

export default function ChartHeader({ title, tooltip }) {
  return (
    <div className="mb-4 flex items-center gap-1.5">
      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
      {tooltip && <InfoTooltip text={tooltip} />}
    </div>
  );
}