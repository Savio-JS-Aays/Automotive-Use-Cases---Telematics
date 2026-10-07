# 01 · Project Overview

> What Fleet Pulse is, who it serves, and where each module stands.
>
> Last updated: 2026-10-01

## What it is
Fleet Pulse is a **connected-vehicle analytics platform** demo, built from the point of view of a
truck OEM. It shows what **Daimler India Commercial Vehicles** (BharatBenz and Mercedes-Benz
Trucks) can offer from the data its trucks already transmit:
- **To fleet customers:** utilization, fuel and idle waste, driver safety.
- **To the OEM's own organisation:** uptime and service, fault diagnostics, component
  reliability, warranty cost, parts supply.

Every metric is designed around data an OEM can really deliver:
- **rFMS 4.0**, the OEM-neutral truck fleet API.
- **SAE J1939 diagnostics**, via the OEM's remote-diagnostics services (Truckonnect for
  BharatBenz, Fleetboard / Uptime for Mercedes-Benz).
- **OEM backend analytics.**

See [02_Domain_Theory.md](02_Domain_Theory.md).

## Fleet in scope
| Model (`dim_v_model`) | Type | Powertrain | Engine / drive | Telematics source |
|---|---|---|---|---|
| BharatBenz 1617R (MOD001) | Rigid cargo, 16.2 t | Diesel | OM904 LA, 6-speed manual, 4x2 | Truckonnect |
| BharatBenz 3528C (MOD002) | Dump / construction, 35 t | Diesel | OM926 LA, 9-speed manual, 8x4 | Truckonnect |
| BharatBenz 5528TT (MOD003) | Tractor-trailer, 55 t GCW | Diesel | OM926 LA, 9-speed manual, 6x4 | Truckonnect |
| Mercedes-Benz Actros L (MOD004) | Long-haul tractor | Diesel | OM471, PowerShift 3 12-speed AMT, 4x2, ADAS | Fleetboard |
| Mercedes-Benz eActros 600 (MOD005) | Battery-electric semi | BEV (621 kWh) | eAxle, 4-speed, 4x2, ADAS | Fleetboard |

**Geography:** 5 Indian regions.

| Region | Area |
|---|---|
| REG001 North | Delhi NCR |
| REG002 South | Kerala |
| REG003 East | West Bengal |
| REG004 West | Maharashtra |
| REG005 Central | Madhya Pradesh |

**Shared data:**
- 10,000 vehicles and 2,000 customers;
- 100 locations and 100 dealers;
- 50 parts from 20 suppliers;
- 8 duty applications: FMCG, reefer, tanker, mining, ready-mix concrete, industrial freight,
  heavy haul, long haul.

**Telematics-connected sample** (simulated): 200 trucks (40 per model). The window is
2026-07-03 → 2026-09-30, with workshop history back to each truck's in-service date.

## Personas and questions
| Persona | Question | Modules |
|---|---|---|
| Fleet manager | Are my trucks productive, and where is money wasted? | Telematics (utilization, idle, fuel) |
| Safety manager | Which drivers need coaching, on what, and is it working? | Telematics (driver behaviour) |
| OEM uptime / service engineer | Which trucks will break down, and what must the workshop prepare? | Overview, Diagnostics, DTC Analysis |
| OEM quality engineer | Which faults and components fail early, by model, engine or supplier? | DTC Analysis, Reliability |
| Warranty / finance | What will failures cost, and how much can prediction save? | Financial & Warranty |
| Parts logistics | Will depots have the parts that predicted failures will need? | Supply Chain |

**Operating principles** (from [Domain.md](../docs/Domain.md)):
- **Dual view:** Fleet View (aggregate) or Asset View (a single truck, when `selectedVin` is set).
- **7-day rolling smoothing** on time series.
- **Idle waste** is the primary financial-waste metric.
- **Safety score** starts at 100, and event penalties are deducted from it.

## Modules and status
| Module | Route | Purpose | Status |
|---|---|---|---|
| Overview | `/` | Fleet risk at a glance, action tracker | **Implemented (new data model)**, 2026-09-30 |
| Vehicle Diagnostics | `/vehicle-diagnostics` | Service engineer: Fault Codes tab (most common faults, system × model, lifecycle, active work list), Signal Health tab (truck × signal map, band distribution, aftertreatment, wear forecast, anomaly → DTC lead time); Asset View with signals, DTC timeline, risk trend, workshop prep, service history | **Implemented (new data model)**, 2026-10-01 |
| DTC Analysis | — | J1939 fault analytics | **Merged into Vehicle Diagnostics** (Fault Codes tab), 2026-10-01 |
| Telematics | `/telematics-data` | Utilization & uptime, fuel / energy / CO₂, driver safety, data health; Asset View with day trace | **Implemented (new data model)**, 2026-10-01 |
| Component Reliability | `/component-reliability` | Quality engineer: Field Life (Kaplan–Meier, β × η map, hazard, variance master), Supplier & Build Quality (scorecard, tier check, build cohort, where parts fail), Root Cause (failure modes, precursor ramp, DTC → part confirmation); Part View | **Implemented (new data model)**, 2026-10-01. Prediction Performance tab deferred |
| Financial & Warranty | `/financial-warranty` | Exposure, preventable savings, claim cost | Implemented (legacy model), to be ported |
| Supply Chain | — (route commented out) | Parts demand vs stock by depot | Implemented (legacy model), hidden |

**Porting order:**
1. Telematics (done 2026-10-01)
2. Diagnostics and DTC Analysis (done 2026-10-01, merged into one module)
3. Overview (done 2026-09-30)
4. Reliability (done 2026-10-01)
5. Financial
6. Supply Chain

The formula status of each module is in [metrics/](metrics/).

## Current milestone (2026-10-01)
- **Done:**
  - the telematics data model is redesigned and live in Supabase;
  - the simulated dataset is seeded (~535k rows);
  - the documentation folder is created;
  - the Overview, Telematics, Vehicle Diagnostics (with DTC analysis) and Component Reliability
    modules are ported;
  - the Application and Customer Type global filters are added.
- **Next:**
  - the Diagnostics Predictive Risk tab and the Reliability Prediction Performance tab (both
    deferred);
  - then Financial and Supply Chain.
