import React from "react";
import { HelpCircle } from "lucide-react";

export default function InfoTooltip({ text }) {
  return (
    <span className="group relative inline-flex">
      <HelpCircle
        className="h-3.5 w-3.5 text-slate-300 hover:text-slate-400 cursor-help"
        strokeWidth={2}
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}