# 08 · Glossary

> Acronyms and domain terms used across the project.
>
> Last updated: 2026-10-01

| Term | Meaning |
|---|---|
| **ABA** | Active Brake Assist: Mercedes-Benz emergency braking system. Events `aba_warning`, `aba_full_brake` |
| **AdBlue / DEF** | Diesel Exhaust Fluid (urea solution) dosed into the SCR catalyst; ≈ 5–6 % of diesel volume |
| **AMT** | Automated Manual Transmission (e.g. Mercedes PowerShift 3) |
| **Asset View** | single-truck drill-down (`selectedVin` set), as opposed to Fleet View |
| **AWL** | Amber Warning Lamp: service soon |
| **B10 life** | distance by which 10 % of a component population has failed. Design B10 is in `dim_part.b10_design_life_miles` |
| **Band state** | a signal value classified against `dim_signal`, taking `direction` into account: critical / warning / outside normal / normal |
| **BEV** | Battery-Electric Vehicle (eActros 600) |
| **Breakdown** | unplanned failure on the road (`visit_type = 'breakdown'`): towing and long downtime |
| **CAN** | Controller Area Network: the in-vehicle bus that J1939 runs on |
| **Coaching quadrant** | Telematics scatter of drivers by eco score (x) and safety score (y), split at eco 70 / safety 85: role model, coach safety, coach eco, coach both |
| **Coasting** | driving without engine torque (eco-roll). `coasting_distance_pct` |
| **Data now** | the latest `last_ping_ts` in the current scope; Telematics measures staleness against it instead of the wall clock |
| **Derate** | ECU-imposed power/speed limit protecting the engine or forcing an emissions repair |
| **DM1 / DM2** | J1939 diagnostic messages: active / previously active DTCs |
| **DPF** | Diesel Particulate Filter. Collects soot; cleaned by *regeneration* |
| **Drifting signal** | the health signal named by the one non-standard key in a DTC's freeze frame; links the fault to its signal |
| **DTC** | Diagnostic Trouble Code. In J1939: SPN + FMI + OC |
| **Due for workshop** | Overview KPI: truck whose worst part has `rul_days ≤ 14` |
| **Duty cycle / application** | how a truck is used (long haul, mining, RMC, …): `dim_application`, `APPLICATION_PROFILES` |
| **Eco score** | 0–100 trip score for fuel-efficient driving ([02 §5](02_Domain_Theory.md#5-driver-behaviour)) |
| **ECU** | Electronic Control Unit. Identified by its J1939 source address |
| **Event family** | Telematics grouping of harsh / ADAS event types: Harsh driving, Speed & RPM, ADAS, Idling |
| **Field B10** | B10 measured from field replacements with Kaplan–Meier (running parts censored); compared with the design B10 as "variance %" |
| **Fleet View** | whole-fleet aggregate view (`selectedVin = null`) |
| **Fleetboard** | Mercedes-Benz Trucks telematics / fleet-management service |
| **Fault name (plain-language)** | the short English name shown for a fault code in the UI (`FAULT_NAMES`, for example "Front brake lining worn" for `SPN1099-FMI18`); the SPN / FMI stays visible as a subtitle |
| **FMI** | Failure Mode Identifier: *how* a parameter is faulty (0–31) |
| **Freeze frame** | snapshot of key parameters when a DTC was set (`fact_dtc_event.freeze_frame`) |
| **GCW** | Gross Combination Weight: truck + trailer + load (kg) |
| **Green band** | the economical engine-speed range (≈ 1,100–1,500 rpm) |
| **Hazard status** | Reliability label from B10 variance: Critical < −20 %, Watch < 0, On Spec, Insufficient Data (< 5 failures) |
| **HGMV / HTV** | Indian heavy-vehicle driving-licence classes |
| **Idle waste** | fuel/money burnt with the engine on and the truck stationary. Shown as `Σ idle_fuel_l × ₹90` |
| **Inducement** | emissions-law derate forcing repair of SCR/DEF faults (SPN 5246) |
| **Intermittent DTC** | a code that self-healed (`status = previously_active`); excluded from repair KPIs |
| **J1939** | SAE standard for heavy-vehicle CAN communication and diagnostics |
| **Kaplan–Meier** | survival estimator that accounts for parts still running (suspensions) ([02 §4](02_Domain_Theory.md#4-reliability-theory)) |
| **Lamp status** | MIL / AWL / RSL / PL carried with a DTC |
| **Lead time (anomaly → DTC)** | days between the first anomalous reading of a fault's drifting signal and the DTC itself |
| **Mahalanobis distance** | multivariate anomaly score across all signals at one timestamp |
| **MIL** | Malfunction Indicator Lamp: emissions-related fault |
| **NFF** | No Fault Found: the replaced part tests OK (`nff_flag`) |
| **NOW / PERIOD** | card badges: NOW = latest prediction or DTC state (ignores the date range); PERIOD = follows the date range |
| **OC** | Occurrence Count of a DTC |
| **ODC** | Over-Dimensional Cargo (heavy haul) |
| **Part life** | km since the part was fitted (renewal model): odometer at failure − odometer at the previous replacement of that part |
| **Pareto chart** | ranking of causes by how often they occur, usually with a cumulative-% line; the Fault Codes tab used one before 2026-10-01 and now shows the simpler Most Common Faults bars |
| **PGN** | Parameter Group Number: the J1939 message that carries a set of SPNs |
| **PL** | Protect Lamp: derate / inducement active |
| **Precursor ramp** | mean \|z\| of a signal in the 7 days before a failure ÷ the same 21–30 days before; > 1 marks an early-warning signal |
| **Predicted repair** | workshop visit booked because the model flagged a developing fault (`visit_type = 'predicted'`) |
| **Previously active** | a DTC that healed itself but is stored (DM2): typical of intermittent faults |
| **PTO** | Power Take-Off: engine power driving equipment (tipper, concrete drum, pump) |
| **Regeneration (regen)** | (1) DPF: burning off soot. (2) BEV: recovering energy while braking |
| **Repeat repair** | same part replaced on the same truck within 10,000 km or 30 days |
| **rFMS** | remote Fleet Management System: ACEA's OEM-neutral truck data API (v4.0) |
| **RMC** | Ready-Mix Concrete (transit mixer) |
| **RO** | Repair Order: one workshop visit (`fact_repair_orders`) |
| **RSL** | Red Stop Lamp: stop safely |
| **RUL** | Remaining Useful Life (km / days) |
| **Safety score** | 0–100 daily score from harsh-event penalties per distance ([02 §5](02_Domain_Theory.md#5-driver-behaviour)) |
| **SCR** | Selective Catalytic Reduction: NOx aftertreatment using AdBlue |
| **Silent truck** | a connected truck (not in a workshop) that sent no packet on its latest day, or whose last report is > 48 h older than "data now". Parked trucks still send hourly heartbeats, so they are not silent |
| **SoC / SoH** | State of Charge / State of Health of the HV battery (%) |
| **SPN** | Suspect Parameter Number: *which* parameter a J1939 value or fault refers to |
| **Survival function S(t)** | share of components still working at distance t; estimated with Kaplan–Meier |
| **Suspension (censoring)** | a part still running: its life so far is known, its failure point is not |
| **Tagged rows** | rows the simulator inserted into shared tables (`data_source = 'telematics_sim'`) |
| **TCU** | Telematics Control Unit (`dim_vehicle.telematics_unit_id`) |
| **Tell-tale** | dashboard warning symbol state, as reported by rFMS |
| **TPMS** | Tyre Pressure Monitoring System |
| **Truckonnect** | BharatBenz connected-truck telematics service |
| **Uptime** | share of time a truck is available (not in the workshop) |
| **Utilization** | engine-on hours ÷ (vehicle-days × 24 h) |
| **VGT** | Variable Geometry Turbocharger |
| **Weibull (β, η)** | lifetime distribution: shape β (failure behaviour), scale η (characteristic life) |
| **Worst part** | a truck's monitored part with the highest 30-day failure probability in the latest prediction; the truck's risk band comes from it |
| **z-score** | standard deviations from the signal's normal-band centre |
