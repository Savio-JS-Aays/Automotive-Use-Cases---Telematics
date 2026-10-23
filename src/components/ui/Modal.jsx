import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Centred pop-up over a dimmed page. Closes on Esc, on the close button and on a click outside.
 * `actions` sit in the header next to the close button (search boxes, toggles).
 */
export default function Modal({ open, onClose, title, subtitle, actions, children, widthClass = "max-w-3xl" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[85vh] w-full ${widthClass} flex-col rounded-2xl bg-white shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
