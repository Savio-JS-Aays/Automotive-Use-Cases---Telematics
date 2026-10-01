// Static reference data for the telematics ecosystem.
// Everything here is modelled on what Daimler Truck (BharatBenz / Mercedes-Benz Trucks)
// can deliver via rFMS 4.0, J1939 remote diagnostics (Truckonnect / Fleetboard / Uptime)
// or OEM backend analytics. SPN/FMI numbers follow SAE J1939-71/-73; SPNs ≥ 520192 are
// the J1939 proprietary range used for OEM-specific codes.

export const DATA_SOURCE_TAG = "telematics_sim";

// ---------------------------------------------------------------------------
// Model specs — written into the new nullable columns of dim_v_model (keyed by variant)
// ---------------------------------------------------------------------------
export const MODEL_SPECS = {
  "1617R": {
    powertrain: "diesel",
    engine_family: "OM904 LA",
    transmission: "G85 6-speed manual",
    top_gear: 6,
    axle_config: "4x2",
    fuel_tank_l: 215,
    battery_kwh: null,
    gcw_max_kg: 16200,
    empty_kg: 5800,
    base_consumption: 17.5,
    consumption_unit: "L/100km",
    idle_lph: 1.8,
    adas_equipped: false,
    telematics_source: "Truckonnect",
    is_tractor: false,
  },
  "3528C": {
    powertrain: "diesel",
    engine_family: "OM926 LA",
    transmission: "G131 9-speed manual",
    top_gear: 9,
    axle_config: "8x4",
    fuel_tank_l: 380,
    battery_kwh: null,
    gcw_max_kg: 35000,
    empty_kg: 12500,
    base_consumption: 30,
    consumption_unit: "L/100km",
    idle_lph: 2.6,
    adas_equipped: false,
    telematics_source: "Truckonnect",
    is_tractor: false,
  },
  "5528TT": {
    powertrain: "diesel",
    engine_family: "OM926 LA",
    transmission: "G131 9-speed manual",
    top_gear: 9,
    axle_config: "6x4",
    fuel_tank_l: 415,
    battery_kwh: null,
    gcw_max_kg: 55000,
    empty_kg: 15500,
    base_consumption: 34,
    consumption_unit: "L/100km",
    idle_lph: 2.8,
    adas_equipped: false,
    telematics_source: "Truckonnect",
    is_tractor: true,
  },
  "Actros L": {
    powertrain: "diesel",
    engine_family: "OM471",
    transmission: "PowerShift 3 12-speed AMT",
    top_gear: 12,
    axle_config: "4x2",
    fuel_tank_l: 600,
    battery_kwh: null,
    gcw_max_kg: 44000,
    empty_kg: 15000,
    base_consumption: 28,
    consumption_unit: "L/100km",
    idle_lph: 2.4,
    adas_equipped: true,
    telematics_source: "Fleetboard",
    is_tractor: true,
  },
  "eActros 600": {
    powertrain: "bev",
    engine_family: "eAxle (2 e-motors)",
    transmission: "4-speed eAxle",
    top_gear: 4,
    axle_config: "4x2",
    fuel_tank_l: null,
    battery_kwh: 621,
    gcw_max_kg: 44000,
    empty_kg: 17000,
    base_consumption: 110,
    consumption_unit: "kWh/100km",
    idle_lph: 0,
    adas_equipped: true,
    telematics_source: "Fleetboard",
    is_tractor: true,
  },
};

export const WARRANTY_MONTHS = 36;
export const WARRANTY_KM = 300000;
export const SPEED_GOVERNOR_KMH = 80; // Indian heavy-vehicle speed-limiter mandate
export const DIESEL_CO2_KG_PER_L = 2.68;
export const DIESEL_PRICE_INR_PER_L = 90;
export const LABOR_RATE_INR_BY_TIER = { Platinum: 1800, Gold: 1500, Silver: 1250, Bronze: 1050 };
export const DEFAULT_LABOR_RATE_INR = 1200;

// ---------------------------------------------------------------------------
// Duty-cycle profiles by dim_application.application_id
// ---------------------------------------------------------------------------
export const APPLICATION_PROFILES = {
  APP001: { label: "FMCG distribution", annual_km: 70000, trips: [2, 3], trip_km: [40, 140], avg_speed: 32, idle_share: 0.16, pto_share: 0, load: 0.6, severity: 1.1, brakes_per_100km: 85, cruise: 0.12, operate_p: 0.9 },
  APP002: { label: "Refrigerated", annual_km: 90000, trips: [1, 2], trip_km: [150, 380], avg_speed: 42, idle_share: 0.15, pto_share: 0, load: 0.7, severity: 1.0, brakes_per_100km: 40, cruise: 0.3, operate_p: 0.9 },
  APP003: { label: "Tanker", annual_km: 80000, trips: [1, 2], trip_km: [100, 300], avg_speed: 40, idle_share: 0.12, pto_share: 0.04, load: 0.8, severity: 1.0, brakes_per_100km: 45, cruise: 0.28, operate_p: 0.88 },
  APP004: { label: "Mining & construction", annual_km: 45000, trips: [3, 5], trip_km: [15, 45], avg_speed: 22, idle_share: 0.3, pto_share: 0.1, load: 0.92, severity: 1.6, brakes_per_100km: 140, cruise: 0.02, operate_p: 0.92 },
  APP005: { label: "Ready-mix concrete", annual_km: 35000, trips: [3, 5], trip_km: [10, 30], avg_speed: 24, idle_share: 0.25, pto_share: 0.25, load: 0.85, severity: 1.35, brakes_per_100km: 120, cruise: 0.02, operate_p: 0.88 },
  APP006: { label: "Automotive & industrial freight", annual_km: 100000, trips: [1, 2], trip_km: [200, 450], avg_speed: 45, idle_share: 0.11, pto_share: 0, load: 0.75, severity: 0.95, brakes_per_100km: 35, cruise: 0.38, operate_p: 0.88 },
  APP007: { label: "Heavy haul & ODC", annual_km: 50000, trips: [1, 1], trip_km: [80, 250], avg_speed: 30, idle_share: 0.18, pto_share: 0.02, load: 0.95, severity: 1.25, brakes_per_100km: 50, cruise: 0.1, operate_p: 0.75 },
  APP008: { label: "Long-haul freight", annual_km: 120000, trips: [1, 2], trip_km: [250, 550], avg_speed: 48, idle_share: 0.1, pto_share: 0, load: 0.72, severity: 0.9, brakes_per_100km: 25, cruise: 0.45, operate_p: 0.9 },
};

export const DRIVER_PROFILES = {
  smooth: { weight: 0.25, aggression: 0.6, idle: 0.8, over_speed: 0.004 },
  average: { weight: 0.55, aggression: 1.0, idle: 1.0, over_speed: 0.02 },
  aggressive: { weight: 0.2, aggression: 1.7, idle: 1.3, over_speed: 0.06 },
};

// ---------------------------------------------------------------------------
// Harsh / ADAS events. Rates are per 100 km for an average driver (≈2 events per 1,000 km
// fleet-wide, in line with heavy-truck telematics benchmarks); penalties follow Domain.md
// ---------------------------------------------------------------------------
export const HARSH_EVENT_TYPES = {
  harsh_brake: { rate: 0.12, penalty: 5, source: "derived", adas: false },
  harsh_accel: { rate: 0.08, penalty: 3, source: "derived", adas: false },
  harsh_cornering: { rate: 0.05, penalty: 10, source: "derived", adas: false },
  overspeed: { rate: 0.06, penalty: 4, source: "derived", adas: false },
  over_rev: { rate: 0.03, penalty: 2, source: "derived", adas: false, diesel_only: true },
  excessive_idle: { rate: 0, penalty: 1, source: "derived", adas: false },
  aba_warning: { rate: 0.03, penalty: 3, source: "OEM-ADAS", adas: true },
  aba_full_brake: { rate: 0.004, penalty: 10, source: "OEM-ADAS", adas: true },
  lane_departure: { rate: 0.06, penalty: 2, source: "OEM-ADAS", adas: true },
  close_following: { rate: 0.08, penalty: 3, source: "OEM-ADAS", adas: true },
};

// ---------------------------------------------------------------------------
// Signal catalog (dim_signal). direction: which side of the normal band is bad.
// health: sampled into fact_telemetry for component-health analytics.
// ---------------------------------------------------------------------------
export const SIGNALS = [
  { signal_code: "WHEEL_SPEED", signal_name: "Wheel-based vehicle speed", unit: "km/h", category: "vehicle", j1939_pgn: 65265, j1939_spn: 84, rfms_field: "wheelBasedSpeed", source: "rFMS", powertrain: "all", sample_interval_s: 300, normal_min: 0, normal_max: 80, warn_threshold: 85, crit_threshold: 95, direction: "high" },
  { signal_code: "ENGINE_SPEED", signal_name: "Engine speed", unit: "rpm", category: "powertrain", j1939_pgn: 61444, j1939_spn: 190, rfms_field: "engineSpeed (classes)", source: "rFMS", powertrain: "diesel", sample_interval_s: 300, normal_min: 600, normal_max: 1800, warn_threshold: 2100, crit_threshold: 2400, direction: "high" },
  { signal_code: "ENGINE_LOAD", signal_name: "Engine percent load at current speed", unit: "%", category: "powertrain", j1939_pgn: 61443, j1939_spn: 92, rfms_field: null, source: "J1939-remote-diag", powertrain: "diesel", sample_interval_s: 300, normal_min: 0, normal_max: 85, warn_threshold: 95, crit_threshold: 100, direction: "high" },
  { signal_code: "FUEL_LEVEL", signal_name: "Fuel level 1", unit: "%", category: "fuel", j1939_pgn: 65276, j1939_spn: 96, rfms_field: "fuelLevel1", source: "rFMS", powertrain: "diesel", sample_interval_s: 300, normal_min: 15, normal_max: 100, warn_threshold: 15, crit_threshold: 8, direction: "low" },
  { signal_code: "FUEL_RATE", signal_name: "Engine fuel rate", unit: "L/h", category: "fuel", j1939_pgn: 65266, j1939_spn: 183, rfms_field: null, source: "J1939-remote-diag", powertrain: "diesel", sample_interval_s: 300, normal_min: 0, normal_max: 60, warn_threshold: 70, crit_threshold: 80, direction: "high" },
  { signal_code: "TOTAL_FUEL_USED", signal_name: "Engine total fuel used", unit: "L", category: "fuel", j1939_pgn: 65257, j1939_spn: 250, rfms_field: "engineTotalFuelUsed", source: "rFMS", powertrain: "diesel", sample_interval_s: 300, normal_min: null, normal_max: null, warn_threshold: null, crit_threshold: null, direction: null },
  { signal_code: "ADBLUE_LEVEL", signal_name: "Aftertreatment DEF tank level", unit: "%", category: "aftertreatment", j1939_pgn: 65110, j1939_spn: 1761, rfms_field: "catalystFuelLevel", source: "rFMS", powertrain: "diesel", sample_interval_s: 300, normal_min: 12, normal_max: 100, warn_threshold: 12, crit_threshold: 5, direction: "low" },
  { signal_code: "GCW", signal_name: "Gross combination vehicle weight", unit: "kg", category: "vehicle", j1939_pgn: 65258, j1939_spn: 1760, rfms_field: "grossCombinationVehicleWeight", source: "rFMS", powertrain: "all", sample_interval_s: 300, normal_min: null, normal_max: null, warn_threshold: null, crit_threshold: null, direction: null },
  { signal_code: "AMBIENT_TEMP", signal_name: "Ambient air temperature", unit: "°C", category: "vehicle", j1939_pgn: 65269, j1939_spn: 171, rfms_field: null, source: "J1939-remote-diag", powertrain: "all", sample_interval_s: 300, normal_min: null, normal_max: null, warn_threshold: null, crit_threshold: null, direction: null },
  { signal_code: "COOLANT_TEMP", signal_name: "Engine coolant temperature", unit: "°C", category: "cooling", j1939_pgn: 65262, j1939_spn: 110, rfms_field: "engineCoolantTemperature", source: "rFMS", powertrain: "diesel", sample_interval_s: 300, normal_min: 80, normal_max: 96, warn_threshold: 100, crit_threshold: 105, direction: "high", health: true },
  { signal_code: "OIL_PRESSURE", signal_name: "Engine oil pressure", unit: "kPa", category: "powertrain", j1939_pgn: 65263, j1939_spn: 100, rfms_field: null, source: "J1939-remote-diag", powertrain: "diesel", sample_interval_s: 300, normal_min: 260, normal_max: 480, warn_threshold: 200, crit_threshold: 150, direction: "low", health: true },
  { signal_code: "BATTERY_VOLTAGE", signal_name: "Battery potential (24 V system)", unit: "V", category: "electrical", j1939_pgn: 65271, j1939_spn: 168, rfms_field: null, source: "J1939-remote-diag", powertrain: "all", sample_interval_s: 300, normal_min: 26.8, normal_max: 28.8, warn_threshold: 25.5, crit_threshold: 24.5, direction: "low", health: true },
  { signal_code: "DPF_SOOT_LOAD", signal_name: "DPF soot load", unit: "%", category: "aftertreatment", j1939_pgn: 64891, j1939_spn: 3719, rfms_field: null, source: "OEM-backend", powertrain: "diesel", sample_interval_s: 3600, normal_min: 0, normal_max: 80, warn_threshold: 90, crit_threshold: 100, direction: "high", health: true },
  { signal_code: "DPF_DIFF_PRESSURE", signal_name: "DPF differential pressure", unit: "kPa", category: "aftertreatment", j1939_pgn: 64946, j1939_spn: 3251, rfms_field: null, source: "OEM-backend", powertrain: "diesel", sample_interval_s: 3600, normal_min: 0.5, normal_max: 12, warn_threshold: 15, crit_threshold: 20, direction: "high", health: true },
  { signal_code: "SCR_EFFICIENCY", signal_name: "SCR NOx conversion efficiency", unit: "%", category: "aftertreatment", j1939_pgn: null, j1939_spn: null, rfms_field: null, source: "derived", powertrain: "diesel", sample_interval_s: 3600, normal_min: 90, normal_max: 99, warn_threshold: 85, crit_threshold: 75, direction: "low", health: true },
  { signal_code: "BOOST_PRESSURE", signal_name: "Intake manifold boost pressure", unit: "kPa", category: "powertrain", j1939_pgn: 65270, j1939_spn: 102, rfms_field: null, source: "J1939-remote-diag", powertrain: "diesel", sample_interval_s: 300, normal_min: 160, normal_max: 260, warn_threshold: 135, crit_threshold: 110, direction: "low", health: true },
  { signal_code: "FUEL_RAIL_PRESSURE", signal_name: "Injector metering rail pressure", unit: "MPa", category: "fuel", j1939_pgn: 65243, j1939_spn: 157, rfms_field: null, source: "J1939-remote-diag", powertrain: "diesel", sample_interval_s: 300, normal_min: 150, normal_max: 200, warn_threshold: 130, crit_threshold: 115, direction: "low", health: true },
  { signal_code: "AIR_PRESSURE", signal_name: "Service brake circuit 1 air pressure", unit: "kPa", category: "brakes", j1939_pgn: 65274, j1939_spn: 117, rfms_field: null, source: "J1939-remote-diag", powertrain: "all", sample_interval_s: 300, normal_min: 760, normal_max: 900, warn_threshold: 650, crit_threshold: 550, direction: "low", health: true },
  { signal_code: "BRAKE_LINING_REMAINING", signal_name: "Brake lining remaining, front axle left", unit: "%", category: "brakes", j1939_pgn: 65196, j1939_spn: 1099, rfms_field: null, source: "OEM-backend", powertrain: "all", sample_interval_s: 3600, normal_min: 25, normal_max: 100, warn_threshold: 20, crit_threshold: 10, direction: "low", health: true },
  { signal_code: "TYRE_PRESSURE", signal_name: "Tyre pressure (TPMS, steer axle)", unit: "kPa", category: "tyres", j1939_pgn: 65268, j1939_spn: 241, rfms_field: null, source: "OEM-backend", powertrain: "all", sample_interval_s: 3600, normal_min: 760, normal_max: 870, warn_threshold: 700, crit_threshold: 620, direction: "low", health: true },
  { signal_code: "HV_SOC", signal_name: "HV battery state of charge", unit: "%", category: "ev", j1939_pgn: null, j1939_spn: null, rfms_field: "batteryPackRemainingCharge", source: "rFMS", powertrain: "bev", sample_interval_s: 300, normal_min: 15, normal_max: 100, warn_threshold: 15, crit_threshold: 8, direction: "low" },
  { signal_code: "HV_SOH", signal_name: "HV battery state of health", unit: "%", category: "ev", j1939_pgn: null, j1939_spn: null, rfms_field: null, source: "OEM-backend", powertrain: "bev", sample_interval_s: 86400, normal_min: 90, normal_max: 100, warn_threshold: 88, crit_threshold: 82, direction: "low", health: true },
  { signal_code: "HV_BATTERY_TEMP", signal_name: "HV battery max cell temperature", unit: "°C", category: "ev", j1939_pgn: null, j1939_spn: null, rfms_field: null, source: "OEM-backend", powertrain: "bev", sample_interval_s: 300, normal_min: 20, normal_max: 40, warn_threshold: 45, crit_threshold: 52, direction: "high", health: true },
];

export const HEALTH_SIGNALS = {
  diesel: SIGNALS.filter((s) => s.health && s.powertrain !== "bev").map((s) => s.signal_code),
  bev: SIGNALS.filter((s) => s.health && s.powertrain !== "diesel").map((s) => s.signal_code),
};

// ---------------------------------------------------------------------------
// J1939 DTC catalog (dim_dtc)
// ---------------------------------------------------------------------------
export const FMI_DESCRIPTIONS = {
  0: "Data valid but above normal operational range – most severe",
  1: "Data valid but below normal operational range – most severe",
  2: "Data erratic, intermittent or incorrect",
  3: "Voltage above normal, or shorted to high source",
  4: "Voltage below normal, or shorted to low source",
  5: "Current below normal or open circuit",
  7: "Mechanical system not responding or out of adjustment",
  15: "Data valid but above normal operating range – least severe",
  16: "Data valid but above normal operating range – moderately severe",
  18: "Data valid but below normal operating range – moderately severe",
};

const ECU = {
  engine: [0x00, "Engine #1 ECU"],
  transmission: [0x03, "Transmission #1"],
  brakes: [0x0b, "Brakes – system controller (EBS/ABS)"],
  cluster: [0x17, "Instrument cluster"],
  aftertreatment: [0x3d, "Aftertreatment #1 (SCR/DPF)"],
  hv: [0xf3, "HV battery management system"],
};

const dtc = (spn, fmi, spnDesc, system, ecu, lamp, severity, canDerate, action, powertrain = "diesel", nuisance = false) => ({
  dtc_id: `SPN${spn}-FMI${fmi}`,
  spn,
  fmi,
  spn_description: spnDesc,
  fmi_description: FMI_DESCRIPTIONS[fmi],
  system,
  ecu_source_address: ECU[ecu][0],
  ecu_name: ECU[ecu][1],
  default_lamp: lamp,
  severity_class: severity,
  can_derate: canDerate,
  recommended_action: action,
  powertrain,
  nuisance,
});

export const DTCS = [
  // Aftertreatment – DEF / SCR
  dtc(3361, 7, "Aftertreatment DEF dosing unit", "aftertreatment", "aftertreatment", "AWL", "major", false, "Inspect DEF dosing valve for crystallisation; flush or replace DEF injector"),
  dtc(4364, 18, "Aftertreatment SCR conversion efficiency", "aftertreatment", "aftertreatment", "AWL", "major", false, "Check DEF quality and dosing; test NOx sensors"),
  dtc(5246, 15, "Aftertreatment SCR operator inducement severity", "aftertreatment", "aftertreatment", "PL", "critical", true, "Inducement active – vehicle will derate. Repair SCR/DEF fault immediately"),
  // Cooling
  dtc(111, 18, "Engine coolant level", "cooling", "engine", "AWL", "major", false, "Top up coolant and pressure-test cooling circuit for leaks"),
  dtc(110, 16, "Engine coolant temperature", "cooling", "engine", "AWL", "major", false, "Reduce load; inspect radiator, fan clutch and thermostat"),
  dtc(110, 0, "Engine coolant temperature", "cooling", "engine", "RSL", "critical", true, "Stop safely – engine protection derate. Tow to workshop for cooling repair"),
  // DPF
  dtc(3719, 16, "DPF soot load percent", "aftertreatment", "aftertreatment", "AWL", "major", false, "Perform parked (stationary) DPF regeneration"),
  dtc(3251, 0, "DPF differential pressure", "aftertreatment", "aftertreatment", "AWL", "major", false, "Inspect DPF for ash loading / cracked substrate"),
  dtc(3719, 0, "DPF soot load percent", "aftertreatment", "aftertreatment", "RSL", "critical", true, "DPF overloaded – service regeneration or DPF replacement required"),
  // Electrical
  dtc(168, 18, "Battery potential / power input 1", "electrical", "engine", "AWL", "minor", false, "Test alternator output and battery state of charge"),
  dtc(168, 1, "Battery potential / power input 1", "electrical", "engine", "RSL", "critical", false, "Charging system failure – replace alternator before no-start"),
  // Fuel injection
  dtc(651, 7, "Engine injector cylinder #1", "fuel", "engine", "MIL", "major", false, "Run injector cut-out test; check injector balance rates"),
  dtc(651, 5, "Engine injector cylinder #1", "fuel", "engine", "MIL", "critical", true, "Injector circuit open – replace injector / harness"),
  // Air handling
  dtc(102, 18, "Engine intake manifold #1 pressure (boost)", "air_intake", "engine", "AWL", "major", false, "Check charge-air leaks and turbocharger condition"),
  dtc(641, 7, "Engine variable geometry turbocharger actuator #1", "air_intake", "engine", "RSL", "critical", true, "VGT actuator not responding – replace turbocharger / actuator"),
  // Brakes
  dtc(1099, 18, "Brake lining remaining, front axle, left wheel", "brakes", "brakes", "AWL", "minor", false, "Schedule brake lining replacement at next workshop visit", "all"),
  dtc(117, 18, "Brake primary pressure", "brakes", "brakes", "AWL", "major", false, "Check air compressor output, air dryer and circuit leaks", "all"),
  dtc(117, 1, "Brake primary pressure", "brakes", "brakes", "RSL", "critical", false, "Stop safely – insufficient brake air pressure", "all"),
  // HV battery (OEM proprietary SPN range)
  dtc(520210, 16, "HV battery max cell temperature (OEM)", "hv_battery", "hv", "AWL", "major", true, "Check battery thermal management (coolant pump, chiller)", "bev"),
  dtc(520210, 0, "HV battery max cell temperature (OEM)", "hv_battery", "hv", "RSL", "critical", true, "HV battery over-temperature – power limited. Workshop required", "bev"),
  dtc(520211, 18, "HV battery state of health (OEM)", "hv_battery", "hv", "AWL", "minor", false, "Run battery capacity test; review module imbalance", "bev"),
  // Nuisance / intermittent codes (self-heal → previously active)
  dtc(84, 2, "Wheel-based vehicle speed", "brakes", "brakes", "AWL", "minor", false, "Check wheel speed sensor air gap and connector", "all", true),
  dtc(639, 2, "J1939 network #1 (primary vehicle network)", "electrical", "engine", "AWL", "minor", false, "Inspect CAN wiring and terminating resistors", "all", true),
  dtc(96, 2, "Fuel level 1", "fuel", "cluster", "AWL", "minor", false, "Check fuel level sender", "diesel", true),
  dtc(3031, 2, "Aftertreatment DEF tank temperature", "aftertreatment", "aftertreatment", "AWL", "minor", false, "Check DEF tank temperature sensor", "diesel", true),
  dtc(523, 2, "Transmission current gear", "transmission", "transmission", "AWL", "minor", false, "Check gear position sensor", "all", true),
  dtc(91, 3, "Accelerator pedal position 1", "powertrain", "engine", "MIL", "major", true, "Pedal sensor fault – limp mode possible; inspect sensor", "all", true),
];

// Relative frequency of intermittent codes (real fleets: wheel-speed sensors and CAN errors lead)
export const NUISANCE_WEIGHTS = {
  "SPN84-FMI2": 3,
  "SPN639-FMI2": 2.5,
  "SPN96-FMI2": 2,
  "SPN3031-FMI2": 1.5,
  "SPN523-FMI2": 1,
  "SPN91-FMI3": 0.4,
};

// Daily safety score = 100 − (Σ event penalties per 100 km) × SAFETY_SCALE, floored at 0.
// Scaling makes a typical aggressive driver land around 60–70 and a smooth driver above 90.
export const SAFETY_SCALE = 6;

// dtc_id → [[part_id, likelihood]]; links diagnostics to dim_part (reliability, warranty, supply chain)
export const DTC_PART_MAP = {
  "SPN3361-FMI7": [["PART009", 0.85]],
  "SPN4364-FMI18": [["PART009", 0.6], ["PART008", 0.15]],
  "SPN5246-FMI15": [["PART009", 0.5]],
  "SPN111-FMI18": [["PART050", 0.7]],
  "SPN110-FMI16": [["PART050", 0.6]],
  "SPN110-FMI0": [["PART050", 0.65]],
  "SPN3719-FMI16": [["PART010", 0.6], ["PART008", 0.2]],
  "SPN3251-FMI0": [["PART010", 0.8]],
  "SPN3719-FMI0": [["PART010", 0.85]],
  "SPN168-FMI18": [["PART037", 0.7], ["PART038", 0.1]],
  "SPN168-FMI1": [["PART037", 0.85]],
  "SPN651-FMI7": [["PART006", 0.8], ["PART007", 0.1]],
  "SPN651-FMI5": [["PART006", 0.85], ["PART039", 0.1]],
  "SPN102-FMI18": [["PART005", 0.7]],
  "SPN641-FMI7": [["PART005", 0.9]],
  "SPN1099-FMI18": [["PART030", 0.95]],
  "SPN117-FMI18": [["PART031", 0.6], ["PART035", 0.25], ["PART032", 0.1]],
  "SPN117-FMI1": [["PART031", 0.7]],
  "SPN520210-FMI16": [["PART044", 0.8]],
  "SPN520210-FMI0": [["PART044", 0.9]],
  "SPN520211-FMI18": [["PART044", 0.7]],
  "SPN84-FMI2": [["PART034", 0.2], ["PART018", 0.1]],
  "SPN639-FMI2": [["PART040", 0.1], ["PART039", 0.1]],
  "SPN91-FMI3": [["PART039", 0.2]],
  "SPN523-FMI2": [["PART011", 0.15]],
};

// ---------------------------------------------------------------------------
// Fault scenarios: signal drift → DTC escalation → predicted repair or breakdown
// stage ∈ [0,1]; codes fire when stage ≥ at; derate once a derating code is active.
// ---------------------------------------------------------------------------
export const SCENARIOS = {
  def_scr: {
    powertrain: "diesel", weight: 3, part_id: "PART009", cluster: "CLS-AFT",
    failure_mode: "DEF dosing valve blocked (urea crystallisation)",
    drift: { SCR_EFFICIENCY: 66 },
    adblue_dosing_factor: 0.35,
    codes: [["SPN3361-FMI7", 0.3], ["SPN4364-FMI18", 0.55], ["SPN5246-FMI15", 0.9]],
    complaint: "Amber lamp on, vehicle limited to 20 km/h after restart",
  },
  coolant_leak: {
    powertrain: "diesel", weight: 2, part_id: "PART050", cluster: "CLS-COOL",
    failure_mode: "Radiator core leak",
    drift: { COOLANT_TEMP: 107 },
    codes: [["SPN111-FMI18", 0.3], ["SPN110-FMI16", 0.6], ["SPN110-FMI0", 0.92]],
    complaint: "Coolant warning and temperature gauge in red on gradients",
  },
  dpf_clog: {
    powertrain: "diesel", weight: 2.5, part_id: "PART010", cluster: "CLS-AFT",
    failure_mode: "DPF ash overload / cracked substrate",
    drift: { DPF_SOOT_LOAD: 118, DPF_DIFF_PRESSURE: 24 },
    app_multiplier: { APP004: 3, APP005: 3, APP001: 1.5 },
    codes: [["SPN3719-FMI16", 0.35], ["SPN3251-FMI0", 0.65], ["SPN3719-FMI0", 0.92]],
    complaint: "Frequent regeneration requests, loss of power",
  },
  alternator: {
    powertrain: "all", weight: 1.5, part_id: "PART037", cluster: "CLS-ELEC",
    failure_mode: "Alternator regulator failure",
    drift: { BATTERY_VOLTAGE: 24.1 },
    codes: [["SPN168-FMI18", 0.4], ["SPN168-FMI1", 0.9]],
    complaint: "Battery warning light, slow cranking in the morning",
  },
  injector: {
    powertrain: "diesel", weight: 1.5, part_id: "PART006", cluster: "CLS-FUEL",
    failure_mode: "Injector nozzle wear / coil open circuit",
    drift: { FUEL_RAIL_PRESSURE: 108 },
    erratic: true,
    codes: [["SPN651-FMI7", 0.4], ["SPN651-FMI5", 0.85]],
    complaint: "Engine misfires and knocks under load, black smoke",
  },
  turbo: {
    powertrain: "diesel", weight: 1.2, part_id: "PART005", cluster: "CLS-AIR",
    failure_mode: "VGT actuator seized / turbine bearing wear",
    drift: { BOOST_PRESSURE: 98 },
    codes: [["SPN102-FMI18", 0.45], ["SPN641-FMI7", 0.9]],
    complaint: "Loss of power on gradients, whistling noise from turbo",
  },
  air_compressor: {
    powertrain: "all", weight: 1.2, part_id: "PART031", cluster: "CLS-BRK",
    failure_mode: "Compressor valve plate wear – low delivery",
    drift: { AIR_PRESSURE: 520 },
    codes: [["SPN117-FMI18", 0.45], ["SPN117-FMI1", 0.9]],
    complaint: "Low air pressure buzzer, slow pressure build-up at start",
  },
  hv_thermal: {
    powertrain: "bev", weight: 4, part_id: "PART044", cluster: "CLS-HV",
    failure_mode: "HV battery module thermal imbalance (coolant pump)",
    part_cost_factor: 0.18,
    labor_hours: 8,
    drift: { HV_BATTERY_TEMP: 56, HV_SOH: 86 },
    codes: [["SPN520211-FMI18", 0.3], ["SPN520210-FMI16", 0.55], ["SPN520210-FMI0", 0.9]],
    complaint: "Reduced power and HV battery temperature warning",
  },
};

// Parts continuously scored by the predictive model (fact_vehicle_health)
export const MONITORED_PARTS = {
  diesel: ["PART009", "PART050", "PART010", "PART037", "PART006", "PART005", "PART030", "PART031"],
  bev: ["PART037", "PART030", "PART031", "PART044"],
};

// Which parts exist on which vehicles
export function partApplies(part, spec, appId) {
  const n = Number(part.part_id.replace("PART", ""));
  const bev = spec.powertrain === "bev";
  const mercedes = spec.telematics_source === "Fleetboard";
  if (n === 44) return bev;
  if (bev && (n <= 10 || n === 12 || n === 13 || n === 49)) return false;
  if (n === 11) return spec.transmission.includes("AMT");
  if (n === 45) return spec.is_tractor;
  if (n === 41 || n === 42 || n === 22) return mercedes;
  if (n === 21) return !mercedes;
  if (n === 20) return ["APP003", "APP004", "APP005"].includes(appId);
  return true;
}

export const FAILURE_MODES = {
  Mechanical: ["Wear-out", "Fatigue crack", "Seal leak", "Bearing failure", "Misalignment"],
  Consumable: ["End-of-life wear", "Contamination", "Glazing"],
  Electrical: ["Open circuit", "Connector corrosion", "Internal short", "Software fault"],
};

export const WEIBULL_BETA = { Mechanical: 2.4, Consumable: 1.8, Electrical: 1.2 };
export const SUPPLIER_LIFE_FACTOR = { High: 0.72, Medium: 0.9, Low: 1.08 };
export const MILES_TO_KM = 1.609344;
