# Fleet Pulse — Documentation

> The project's knowledge base: what we are building, the theory behind it, how the data fits
> together, and the exact formula behind every KPI and chart.
>
> Last updated: 2026-10-01

## Index
| # | File | Read it when you need… |
|---|---|---|
| 01 | [Project Overview](01_Project_Overview.md) | what Fleet Pulse is, who uses it, module status |
| 02 | [Domain Theory](02_Domain_Theory.md) | the OEM telematics, diagnostics, reliability and cost theory behind the metrics |
| 03 | [Technical Architecture](03_Technical_Architecture.md) | stack, code layout, data access, security, commands |
| 04 | [Data Model](04_Data_Model.md) | every table: grain, keys, columns, units, sources |
| 05 | [Data Relationships](05_Data_Relationships.md) | joins, lineage (signal → DTC → repair → claim → forecast), filter mapping, shared-table rules |
| 06 | [Data Generation](06_Data_Generation.md) | how the simulated dataset is produced, its assumptions and checks |
| 07 | [Metrics](metrics/) | per-module formula reference for every KPI, chart and table |
| 08 | [Glossary](08_Glossary.md) | acronyms and domain terms |
| 09 | [Changelog](09_Changelog.md) | what changed and when |

The per-module metric files:
- [Overview](metrics/overview.md)
- [Diagnostics](metrics/diagnostics.md)
- [DTC Analysis](metrics/dtc-analysis.md) (merged into Diagnostics; kept as the plan and definitions)
- [Telematics](metrics/telematics.md)
- [Reliability](metrics/reliability.md)
- [Financial & Warranty](metrics/financial-warranty.md)
- [Supply Chain](metrics/supply-chain.md)

### Related guidance (in `../docs/`)
These are briefs and rules the documentation builds on. They are not duplicated here:
- [Domain.md](../docs/Domain.md): business rules (idle waste, safety score, dual view, smoothing).
- [UI_Guide.md](../docs/UI_Guide.md): styling and charting rules.
- [project_context.md](../docs/project_context.md): OEM context and the data-model design brief.
- [CLAUDE.md](../docs/CLAUDE.md): code map and known quirks.
- [scripts/telematics-db/README.md](../scripts/telematics-db/README.md): how to run the DB setup.

## Status labels used in metric files
| Label | Meaning |
|---|---|
| **Implemented (legacy model)** | In the UI today, computed from the pre-redesign columns. It will break or change when the module is ported |
| **Implemented** | In the UI and reading the new data model |
| **Planned** | Designed (formula and source defined) but not built yet |

## Maintenance rule
Documentation is part of "done". After implementing or changing any feature, update this folder
in the same task.

**Update checklist:**
- [ ] KPI or chart added or changed → `metrics/<module>.md`: title, chart type, formula, source
  columns, filters applied/ignored, constants, business meaning, status.
- [ ] Table, column, view or FK added or changed → [04_Data_Model.md](04_Data_Model.md) and
  [05_Data_Relationships.md](05_Data_Relationships.md).
- [ ] Simulator or seed changed → [06_Data_Generation.md](06_Data_Generation.md).
- [ ] New domain concept, threshold or acronym → [02_Domain_Theory.md](02_Domain_Theory.md) and
  [08_Glossary.md](08_Glossary.md).
- [ ] Stack, commands or folder structure changed →
  [03_Technical_Architecture.md](03_Technical_Architecture.md).
- [ ] Module status changed → table in [01_Project_Overview.md](01_Project_Overview.md).
- [ ] **Always:** a dated entry in [09_Changelog.md](09_Changelog.md), and bump "Last updated" in
  every file you touched.

**Conventions:**
- Formulas are written in plain math: `Σ`, `avg`, `count`, `/`, `×`.
- Column references use `table.column`.
- Money is **INR** unless a formula states a conversion.
- Distances are **km** in the new data model. The legacy model and some shared columns use
  **miles**; this is stated wherever it applies.
