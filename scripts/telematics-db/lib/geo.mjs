// Geography for the Daimler India CV fleet. Cities are the ones that appear in
// dim_location.location_name; coordinates are city centres (WGS84).

export const CITY_COORDS = {
  // REG001 North (Delhi NCR / Haryana)
  "New Delhi": [28.6139, 77.209],
  Faridabad: [28.4089, 77.3178],
  Gurugram: [28.4595, 77.0266],
  Panipat: [29.3909, 76.9635],
  Sonipat: [28.9931, 77.0151],
  // REG002 South (Kerala)
  Kochi: [9.9312, 76.2673],
  Kannur: [11.8745, 75.3704],
  Kottayam: [9.5916, 76.5222],
  Kozhikode: [11.2588, 75.7804],
  Palakkad: [10.7867, 76.6548],
  Thiruvananthapuram: [8.5241, 76.9366],
  Thrissur: [10.5276, 76.2144],
  // REG003 East (West Bengal)
  Kolkata: [22.5726, 88.3639],
  Howrah: [22.5958, 88.2636],
  Asansol: [23.6739, 86.9524],
  Bardhaman: [23.2324, 87.8615],
  Durgapur: [23.5204, 87.3119],
  Haldia: [22.0667, 88.0698],
  Siliguri: [26.7271, 88.3953],
  // REG004 West (Maharashtra)
  Mumbai: [19.076, 72.8777],
  Thane: [19.2183, 72.9781],
  Pune: [18.5204, 73.8567],
  Nashik: [19.9975, 73.7898],
  Nagpur: [21.1458, 79.0882],
  Kolhapur: [16.705, 74.2433],
  Ahmednagar: [19.0948, 74.748],
  // REG005 Central (Madhya Pradesh)
  Bhopal: [23.2599, 77.4126],
  Indore: [22.7196, 75.8577],
  Gwalior: [26.2183, 78.1828],
  Jabalpur: [23.1815, 79.9864],
  Rewa: [24.5362, 81.3037],
  Sagar: [23.8388, 78.7378],
  Ujjain: [23.1765, 75.7885],
};

export const REGION_CITIES = {
  REG001: ["New Delhi", "Faridabad", "Gurugram", "Panipat", "Sonipat"],
  REG002: ["Kochi", "Kannur", "Kottayam", "Kozhikode", "Palakkad", "Thiruvananthapuram", "Thrissur"],
  REG003: ["Kolkata", "Howrah", "Asansol", "Bardhaman", "Durgapur", "Haldia", "Siliguri"],
  REG004: ["Mumbai", "Thane", "Pune", "Nashik", "Nagpur", "Kolhapur", "Ahmednagar"],
  REG005: ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Rewa", "Sagar", "Ujjain"],
};

export const REGION_HUB = {
  REG001: "New Delhi",
  REG002: "Kochi",
  REG003: "Kolkata",
  REG004: "Mumbai",
  REG005: "Bhopal",
};

// Typical late-monsoon ambient (°C) by region: [daily mean, diurnal half-swing]
export const REGION_CLIMATE = {
  REG001: [32, 5],
  REG002: [28, 3],
  REG003: [31, 4],
  REG004: [29, 4],
  REG005: [30, 5],
};

const CITY_NAMES = Object.keys(CITY_COORDS).sort((a, b) => b.length - a.length);

export function cityFromLocationName(locationName, regionId) {
  if (locationName) {
    const found = CITY_NAMES.find((c) => locationName.includes(c));
    if (found) return found;
  }
  return REGION_HUB[regionId] ?? "New Delhi";
}

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
const EARTH_KM = 6371;

export function haversineKm([lat1, lon1], [lat2, lon2]) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

// Indian highway distances are ~25–35 % longer than the great-circle distance.
export const ROAD_FACTOR = 1.3;
export const roadKm = (a, b) => haversineKm(a, b) * ROAD_FACTOR;

export function bearingDeg([lat1, lon1], [lat2, lon2]) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destinationPoint([lat, lon], bearing, km) {
  const d = km / EARTH_KM;
  const b = toRad(bearing);
  const p1 = toRad(lat);
  const l1 = toRad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [toDeg(p2), toDeg(l2)];
}

export function interpolate([lat1, lon1], [lat2, lon2], f) {
  return [lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f];
}

// Keep generated points inside the Indian mainland bounding box.
export function clampToIndia([lat, lon]) {
  return [Math.min(32, Math.max(8.2, lat)), Math.min(89.5, Math.max(72.7, lon))];
}
