export type DefaultProjectCategory = {
  name: string;
  code: string;
  description: string;
  color: string;
};

export const DEFAULT_PROJECT_CATEGORIES: DefaultProjectCategory[] = [
  { name: "WASH", code: "WASH", description: "Water, sanitation, hygiene, and related infrastructure.", color: "#06b6d4" },
  { name: "Education", code: "EDU", description: "Schools, learning centres, training facilities, and education services.", color: "#3b82f6" },
  { name: "Livelihood", code: "LIV", description: "Economic recovery, jobs, enterprise, and livelihood support projects.", color: "#22c55e" },
  { name: "Health", code: "HLTH", description: "Hospitals, clinics, health posts, and public health facilities.", color: "#ef4444" },
  { name: "Development", code: "DEV", description: "General development and institutional support projects.", color: "#8b5cf6" },
  { name: "Roads", code: "ROAD", description: "Road construction, rehabilitation, access roads, and pavement works.", color: "#f59e0b" },
  { name: "Buildings", code: "BLDG", description: "Building construction, rehabilitation, and public building works.", color: "#64748b" },
  { name: "Bridges", code: "BRDG", description: "Bridge, culvert, crossing, and elevated structure works.", color: "#14b8a6" },
  { name: "Drainage", code: "DRNG", description: "Stormwater drainage, channels, culverts, and flood mitigation.", color: "#0ea5e9" },
  { name: "Water Supply", code: "WTR", description: "Water networks, wells, tanks, boreholes, and supply systems.", color: "#2563eb" },
  { name: "Sanitation", code: "SAN", description: "Sanitation facilities, sewerage, latrines, and wastewater works.", color: "#10b981" },
  { name: "Solar / Energy", code: "ENER", description: "Solarization, power supply, street power, and energy systems.", color: "#eab308" },
  { name: "Public Facilities", code: "PUB", description: "Community, municipal, civic, and shared public facilities.", color: "#a855f7" },
  { name: "Markets", code: "MRKT", description: "Market facilities, trading areas, and commercial public spaces.", color: "#f97316" },
  { name: "Parks / Public Space", code: "PARK", description: "Parks, plazas, landscaping, recreation, and public realm projects.", color: "#84cc16" },
  { name: "Street Lighting", code: "LIGHT", description: "Street lights, area lighting, and public lighting systems.", color: "#facc15" },
  { name: "Solid Waste", code: "WASTE", description: "Waste collection, transfer, disposal, and solid waste facilities.", color: "#78716c" },
  { name: "Other", code: "OTHER", description: "Projects that do not fit the standard categories.", color: "#94a3b8" },
];

export const categorySlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
