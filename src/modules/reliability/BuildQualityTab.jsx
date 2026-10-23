import React, { useMemo, useState } from "react";
import { cohortMatrix, whereFails } from "./reliabilityMetrics";
import { formatNumber, truncateString } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, EmptyChart, HeatGrid, LocalSelect, Segmented } from "../telematics/TelematicsUi";

const WHERE_DIMS = [
  { value: "application", label: "Application" },
  { value: "region", label: "Region" },
  { value: "model", label: "Model" },
];

/**
 * Build Quality tab: when the trucks were built (cohort × age at failure) and where they run
 * (failure rate by duty cycle, region or model). Split from "Supplier & Build Quality" on 2026-10-23.
 */
export default function BuildQualityTab({ raw, lt, summaries, loading, onOpenPart }) {
  const [dim, setDim] = useState("application");
  const [cohortOpts, setCohortOpts] = useState({ grain: "quarter", modelId: "all", subsystem: "all", partId: "all", supplierId: "all" });
  // Cascading filters: model → subsystem → part → supplier. Each list only offers values that occur in
  // the failures matching the filters above it; changing a filter clears the ones below it.
  const CASCADE = ["modelId", "subsystem", "partId", "supplierId"];
  const setCohort = (key) => (value) =>
    setCohortOpts((p) => {
      const next = { ...p, [key]: value };
      const i = CASCADE.indexOf(key);
      if (i !== -1) for (const k of CASCADE.slice(i + 1)) next[k] = "all";
      return next;
    });
  const cohortChoices = useMemo(() => {
    const sortOpts = (all, pairs) => [
      { value: "all", label: all },
      ...[...new Map(pairs).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]))).map(([value, label]) => ({ value, label })),
    ];
    const subsystemOf = (f) => lt.partsById.get(f.partId)?.vehicle_subsystem;
    const byModel = lt.failures.filter((f) => cohortOpts.modelId === "all" || lt.vehicles.get(f.vehicleId)?.model_id === cohortOpts.modelId);
    const bySubsystem = byModel.filter((f) => cohortOpts.subsystem === "all" || subsystemOf(f) === cohortOpts.subsystem);
    const byPart = bySubsystem.filter((f) => cohortOpts.partId === "all" || f.partId === cohortOpts.partId);
    return {
      model: sortOpts("All models", [...lt.vehicles.values()].map((v) => [v.model_id, v.model_label ?? v.model_id])),
      subsystem: sortOpts("All subsystems", byModel.filter(subsystemOf).map((f) => [subsystemOf(f), subsystemOf(f)])),
      part: sortOpts("All parts", bySubsystem.map((f) => [f.partId, lt.partsById.get(f.partId)?.part_name ?? f.partId])),
      supplier: sortOpts(
        "All suppliers",
        byPart.filter((f) => f.supplierId).map((f) => [f.supplierId, lt.suppliersById.get(f.supplierId)?.supplier_name ?? f.supplierId])
      ),
    };
  }, [lt, cohortOpts.modelId, cohortOpts.subsystem, cohortOpts.partId]);
  const cohorts = useMemo(() => cohortMatrix(lt, raw.latestDate, cohortOpts), [lt, raw.latestDate, cohortOpts]);
  const cohortFiltered = cohortOpts.modelId !== "all" || cohortOpts.subsystem !== "all" || cohortOpts.partId !== "all" || cohortOpts.supplierId !== "all";
  const where = useMemo(() => whereFails(lt, summaries, dim), [lt, summaries, dim]);

  return (
    <div className="space-y-4">
      <ChartCard
        title="Build Cohort × Age at Failure"
        subtitle={`Failures per 100 trucks of each build ${cohortOpts.grain === "year" ? "year" : "quarter"} that reached each age${cohortFiltered ? " · filtered" : ""}`}
        actions={
          <>
            <Segmented
              size="xs"
              value={cohortOpts.grain}
              onChange={setCohort("grain")}
              options={[
                { value: "quarter", label: "Quarter" },
                { value: "year", label: "Year" },
              ]}
            />
            <LocalSelect label="" value={cohortOpts.modelId} onChange={setCohort("modelId")} options={cohortChoices.model} />
            <LocalSelect label="" value={cohortOpts.subsystem} onChange={setCohort("subsystem")} options={cohortChoices.subsystem} />
            <LocalSelect label="" value={cohortOpts.partId} onChange={setCohort("partId")} options={cohortChoices.part} />
            <LocalSelect label="" value={cohortOpts.supplierId} onChange={setCohort("supplierId")} options={cohortChoices.supplier} />
          </>
        }
        tooltip="Rows = production quarter; columns = vehicle age when the part failed. Cell = failures per 100 trucks of that cohort that have reached that age. A single hot row points to a build-period quality problem (a bad batch or process change); a hot column is normal ageing. Cohorts with fewer than 5 trucks exposed are greyed. Filters: build grain (quarter / year); model limits both the trucks and their failures; subsystem, part and supplier limit the failures counted, while the denominator stays all trucks of the cohort, so a supplier filter shows that supplier's failures per 100 trucks built, not per 100 parts fitted."
      >
        {loading ? (
          <ChartSkeleton />
        ) : cohorts.rows.length === 0 ? (
          <EmptyChart message="No trucks with a production date match these filters." />
        ) : (
          <HeatGrid
            rows={cohorts.rows.map((r) => ({ ...r, label: `${r.label} (${r.trucks})` }))}
            cols={cohorts.cols}
            max={cohorts.max}
            rgb="139, 92, 246"
            rowLabelWidth={110}
            cellHeight="h-9"
            cellFor={(ri, ci) => {
              const r = cohorts.rows[ri];
              const c = cohorts.cols[ci];
              const cell = cohorts.cells.get(`${r.id}|${c.id}`);
              if (cell.exposed === 0) return { empty: true, title: `${r.label}: no trucks this old yet` };
              return {
                value: cell.per100,
                display: formatNumber(cell.per100, 0),
                sub: `${cell.count}`,
                muted: cell.muted,
                title: `${r.label} · ${c.label}: ${cell.count} failures across ${cell.exposed} trucks that reached this age (${cell.per100.toFixed(1)} per 100)`,
              };
            }}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Where Parts Fail"
        tooltip="Failures per 100,000 km of part life for the 12 most-replaced components, by duty cycle, region or model. Normalising by km separates tough duty (mining, construction) from genuinely weak parts. Groups with fewer than 5 trucks are greyed. Click a cell to open the part."
        actions={<Segmented value={dim} onChange={setDim} options={WHERE_DIMS} />}
      >
        {loading ? (
          <ChartSkeleton height="h-96" />
        ) : where.rows.length === 0 ? (
          <EmptyChart message="No failures." />
        ) : (
          <HeatGrid
            rows={where.rows}
            cols={where.cols}
            max={where.max}
            rgb="14, 165, 233"
            rowLabelWidth={180}
            minColWidth={72}
            cellHeight="h-9"
            colLabel={(c) => truncateString(c.label, 16)}
            cellFor={(ri, ci) => {
              const r = where.rows[ri];
              const c = where.cols[ci];
              const cell = where.cells.get(`${r.id}|${c.id}`);
              if (cell.empty) return { empty: true, title: `${r.label} is not fitted in ${c.label}` };
              return {
                value: cell.rate ?? 0,
                display: formatNumber(cell.rate, 2),
                sub: `${cell.failures}`,
                muted: cell.muted,
                title: `${r.label} · ${c.label}: ${cell.failures} failures, ${cell.rate?.toFixed(3) ?? "—"} per 100k km (${cell.trucks} trucks)`,
                onClick: () => onOpenPart(r.id),
              };
            }}
          />
        )}
      </ChartCard>
    </div>
  );
}
