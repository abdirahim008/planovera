export type SomaliaTown = {
  name: string;
  latitude: number;
  longitude: number;
};

export type SomaliaRegion = {
  name: string;
  towns: SomaliaTown[];
};

export const SOMALIA_REGIONS: SomaliaRegion[] = [
  {
    name: "Banadir",
    towns: [
      { name: "Mogadishu", latitude: 2.0469, longitude: 45.3182 },
      { name: "Daynile", latitude: 2.0736, longitude: 45.2548 },
      { name: "Kahda", latitude: 2.0184, longitude: 45.2507 },
      { name: "Wadajir", latitude: 2.0286, longitude: 45.3047 },
    ],
  },
  {
    name: "Somaliland",
    towns: [
      { name: "Hargeisa", latitude: 9.56, longitude: 44.065 },
      { name: "Berbera", latitude: 10.4396, longitude: 45.0143 },
      { name: "Burao", latitude: 9.5221, longitude: 45.5336 },
      { name: "Borama", latitude: 9.9361, longitude: 43.1828 },
      { name: "Erigavo", latitude: 10.6162, longitude: 47.3679 },
    ],
  },
  {
    name: "Puntland",
    towns: [
      { name: "Garowe", latitude: 8.4054, longitude: 48.4845 },
      { name: "Bosaso", latitude: 11.2842, longitude: 49.1816 },
      { name: "Galkayo", latitude: 6.7697, longitude: 47.4308 },
      { name: "Qardho", latitude: 9.5007, longitude: 49.0869 },
      { name: "Eyl", latitude: 7.9803, longitude: 49.8164 },
    ],
  },
  {
    name: "Galmudug",
    towns: [
      { name: "Dhusamareb", latitude: 5.535, longitude: 46.3867 },
      { name: "Adado", latitude: 6.136, longitude: 46.6276 },
      { name: "Galkayo South", latitude: 6.7629, longitude: 47.4234 },
      { name: "Hobyo", latitude: 5.3505, longitude: 48.5268 },
    ],
  },
  {
    name: "Hirshabelle",
    towns: [
      { name: "Jowhar", latitude: 2.7809, longitude: 45.5005 },
      { name: "Beledweyne", latitude: 4.7358, longitude: 45.2036 },
      { name: "Bulo Burto", latitude: 3.8542, longitude: 45.5674 },
      { name: "Balad", latitude: 2.355, longitude: 45.3856 },
    ],
  },
  {
    name: "South West State",
    towns: [
      { name: "Baidoa", latitude: 3.1138, longitude: 43.6498 },
      { name: "Barawe", latitude: 1.1006, longitude: 44.0314 },
      { name: "Hudur", latitude: 4.1213, longitude: 43.8894 },
      { name: "Wanlaweyn", latitude: 2.6185, longitude: 44.8938 },
    ],
  },
  {
    name: "Jubaland",
    towns: [
      { name: "Kismayo", latitude: -0.3582, longitude: 42.5454 },
      { name: "Garbaharey", latitude: 3.3289, longitude: 42.2209 },
      { name: "Bardera", latitude: 2.3446, longitude: 42.2764 },
      { name: "Afmadow", latitude: 0.5154, longitude: 42.0707 },
      { name: "Doolow", latitude: 4.1769, longitude: 42.0662 },
    ],
  },
];

export const findSomaliaTown = (regionName?: string, townName?: string) => {
  const normalizedTown = townName?.trim().toLowerCase();
  if (!normalizedTown) return null;

  const regions = regionName
    ? SOMALIA_REGIONS.filter((region) => region.name.toLowerCase() === regionName.trim().toLowerCase())
    : SOMALIA_REGIONS;

  for (const region of regions) {
    const town = region.towns.find((item) => item.name.toLowerCase() === normalizedTown);
    if (town) return { region: region.name, ...town };
  }

  return null;
};
