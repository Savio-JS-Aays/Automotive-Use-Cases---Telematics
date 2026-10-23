import React, { useMemo, useState } from "react";
import RankedBars from "../../components/ui/RankedBars";
import Modal from "../../components/ui/Modal";
import { HAZARD_STYLES, formatKm, supplierScorecard, supplierTable } from "./reliabilityMetrics";
import { formatInr, formatNumber } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, LocalSelect, Pill } from "../telematics/TelematicsUi";

const pctOrDash = (v, digits = 0) => (v === null || v === undefined ? "—" : `${v.toFixed(digits)}%`);

/** Supplier Quality tab: part × supplier scorecard and the per-supplier table (split 2026-10-23). */
export default function SupplierQualityTab({ lt, summaries, loading, onOpenPart }) {
  const suppliers = useMemo(() => supplierTable(lt, summaries), [lt, summaries]);
  const [openSupplier, setOpenSupplier] = useState(null);
  const supplierRow = openSupplier ? suppliers.find((r) => r.supplierId === openSupplier) : null;
  const [supplier, setSupplier] = useState("all");
  const allGroups = useMemo(() => supplierScorecard(summaries, Infinity), [summaries]);
  const supplierOptions = useMemo(
    () => [
      { value: "all", label: "All suppliers (worst 15)" },
      ...[...new Map(allGroups.map((r) => [r.supplierId, r.supplierName])).entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
        .map(([value, label]) => ({ value, label })),
    ],
    [allGroups]
  );
  const scorecard = useMemo(
    () => (supplier === "all" ? allGroups.slice(0, 15) : allGroups.filter((r) => r.supplierId === supplier)),
    [allGroups, supplier]
  );
  const supplierStats = useMemo(() => {
    if (supplier === "all" || scorecard.length === 0) return null;
    const below = scorecard.filter((r) => r.pctOfDesign < 100).length;
    const sorted = scorecard.map((r) => r.pctOfDesign).sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { parts: scorecard.length, below, median };
  }, [supplier, scorecard]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <ChartCard
          title="Supplier Scorecard: Field B10 as % of Design"
          subtitle={
            supplierStats
              ? `${supplierOptions.find((o) => o.value === supplier)?.label}: ${supplierStats.parts} rated parts, ${supplierStats.below} below design, median ${supplierStats.median.toFixed(0)}% of design`
              : `Worst 15 of ${allGroups.length} part × supplier groups with at least 5 failures`
          }
          actions={<LocalSelect label="Supplier" value={supplier} onChange={setSupplier} options={supplierOptions} />}
          tooltip="Field B10 life of each part × supplier combination (at least 5 failures) as a share of the design B10; the 15 worst are shown. Below 100 % = the supplier's parts reach 10 % failures earlier than engineering specified. Click a bar for the Part View."
        >
          {loading ? (
            <ChartSkeleton height="h-96" />
          ) : scorecard.length === 0 ? (
            <EmptyChart height="h-96" message={supplier === "all" ? "No part × supplier group has 5 or more failures." : "This supplier has no part with 5 or more failures in scope."} />
          ) : (
            <RankedBars
              rows={scorecard}
              getLabel={(r) => (supplier === "all" ? r.label : r.partName)}
              valueKey="pctOfDesign"
              max={Math.max(110, Math.ceil(Math.max(...scorecard.map((r) => r.pctOfDesign)) / 10) * 10)}
              formatValue={(r) => `${r.pctOfDesign.toFixed(0)}% · n=${r.failures}`}
              reference={{ value: 100, label: "Design B10 (100%)", color: "#10b981" }}
              renderDetail={(r) => `${r.pctOfDesign.toFixed(0)}% of design (${formatKm(r.fieldB10)}${r.extrapolated ? ", extrapolated" : ""} · ${r.failures} failures)`}
              onRowClick={(r) => onOpenPart(r.partId)}
            />
          )}
        </ChartCard>

      </div>

      <DataTable
        title="Supplier Quality Table"
        tooltip="One row per supplier across all its parts, worst first (median field B10 as % of design, then failure rate). Field-B10 figures use only part × supplier groups with at least 5 failures, so small suppliers show '—'. Failure rate = failures ÷ km of part life × 100,000, which is fair across suppliers of different size. Click a row for the supplier's parts."
        loading={loading}
        rows={suppliers}
        rowKey={(r) => r.supplierId}
        onRowClick={(r) => setOpenSupplier(r.supplierId)}
        emptyMessage="No supplier has failures for the trucks in scope."
        searchPlaceholder="Search supplier or part"
        searchText={(r) => `${r.supplierName} ${r.groups.map((g) => g.partName).join(" ")}`}
        csvName="supplier-quality.csv"
        columns={[
          { key: "name", label: "Supplier", sortValue: (r) => r.supplierName, csv: (r) => r.supplierName, className: "font-medium text-slate-700", render: (r) => r.supplierName },
          { key: "status", label: "Status", sortValue: (r) => ["Critical", "Watch", "On Spec", "Insufficient Data"].indexOf(r.status), csv: (r) => r.status, render: (r) => <Pill className={HAZARD_STYLES[r.status]}>{r.status}</Pill> },
          { key: "parts", label: "Parts", align: "right", sortValue: (r) => r.partsSupplied, csv: (r) => r.partsSupplied, render: (r) => r.partsSupplied },
          { key: "rated", label: "Rated / below design", align: "right", sortValue: (r) => r.belowDesign, csv: (r) => `${r.belowDesign}/${r.ratedParts}`, render: (r) => (r.ratedParts ? `${r.belowDesign} / ${r.ratedParts}` : "—") },
          {
            key: "median",
            label: "Median % of design",
            align: "right",
            sortValue: (r) => r.medianPct,
            csv: (r) => r.medianPct?.toFixed(1) ?? "",
            render: (r) => <span className={r.medianPct !== null && r.medianPct < 100 ? "font-semibold text-rose-600" : ""}>{pctOrDash(r.medianPct)}</span>,
          },
          {
            key: "worst",
            label: "Worst part",
            sortValue: (r) => r.worst?.pctOfDesign ?? null,
            csv: (r) => (r.worst ? `${r.worst.partName} ${r.worst.pctOfDesign.toFixed(0)}%` : ""),
            render: (r) => (r.worst ? <span className="text-xs">{r.worst.partName} · {r.worst.pctOfDesign.toFixed(0)}%</span> : <span className="text-slate-300">—</span>),
          },
          { key: "fails", label: "Failures", align: "right", sortValue: (r) => r.failures, csv: (r) => r.failures, render: (r) => formatNumber(r.failures) },
          { key: "rate", label: "Per 100k km", align: "right", sortValue: (r) => r.ratePer100k, csv: (r) => r.ratePer100k?.toFixed(3) ?? "", render: (r) => (r.ratePer100k === null ? "—" : formatNumber(r.ratePer100k, 2)) },
          { key: "down", label: "Downtime / failure", align: "right", sortValue: (r) => r.meanDowntime, csv: (r) => r.meanDowntime?.toFixed(1) ?? "", render: (r) => (r.meanDowntime === null ? "—" : `${formatNumber(r.meanDowntime, 1)} h`) },
          { key: "cost", label: "Parts cost", align: "right", sortValue: (r) => r.cost, csv: (r) => Math.round(r.cost), render: (r) => formatInr(r.cost) },
        ]}
      />

      <Modal
        open={Boolean(supplierRow)}
        onClose={() => setOpenSupplier(null)}
        widthClass="max-w-4xl"
        title={supplierRow ? supplierRow.supplierName : ""}
        subtitle={
          supplierRow
            ? `${supplierRow.partsSupplied} parts · ${formatNumber(supplierRow.failures)} failures · median ${pctOrDash(supplierRow.medianPct)} of design · ${supplierRow.status}`
            : ""
        }
        actions={
          supplierRow && supplierOptions.some((o) => o.value === supplierRow.supplierId) ? (
            <button
              type="button"
              onClick={() => {
                setSupplier(supplierRow.supplierId);
                setOpenSupplier(null);
                document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Show in scorecard
            </button>
          ) : null
        }
      >
        {supplierRow && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Part</th>
                  <th className="px-3 py-2 text-right font-semibold">Failures</th>
                  <th className="px-3 py-2 text-right font-semibold">Field B10</th>
                  <th className="px-3 py-2 text-right font-semibold">Design B10</th>
                  <th className="px-3 py-2 text-right font-semibold">% of design</th>
                  <th className="px-3 py-2 text-right font-semibold">Per 100k km</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierRow.groups.map((g) => (
                  <tr
                    key={g.partId}
                    onClick={() => {
                      setOpenSupplier(null);
                      onOpenPart(g.partId);
                    }}
                    className="cursor-pointer hover:bg-sky-50"
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-700">{g.partName}</p>
                      <p className="text-[11px] text-slate-400">{g.subsystem ?? "—"}</p>
                    </td>
                    <td className="px-3 py-2 text-right">{g.failures}</td>
                    <td className="px-3 py-2 text-right">
                      {formatKm(g.fieldB10)}
                      {g.extrapolated ? <span className="ml-1 text-[10px] text-slate-400">ext.</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{formatKm(g.designKm)}</td>
                    <td className={`px-3 py-2 text-right ${g.pctOfDesign !== null && g.pctOfDesign < 100 ? "font-semibold text-rose-600" : ""}`}>{pctOrDash(g.pctOfDesign)}</td>
                    <td className="px-3 py-2 text-right">{g.ratePer100k === null || g.ratePer100k === undefined ? "—" : formatNumber(g.ratePer100k, 2)}</td>
                    <td className="px-3 py-2">
                      <Pill className={HAZARD_STYLES[g.status]}>{g.status}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] text-slate-400">"—" in % of design = fewer than 5 failures for this part from this supplier. Click a part to open it.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
