const parseNumericValue = (value: string | number | null | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const isPercentageUnit = (unit: string | null | undefined): boolean => {
  const normalized = String(unit || "").trim().toLowerCase();
  return normalized === "%" || normalized === "percent" || normalized === "percentage";
};

export const calculateBOQLineAmount = (
  qty: string | number | null | undefined,
  rate: string | number | null | undefined,
  unit?: string | null
): number => {
  const quantity = parseNumericValue(qty);
  const unitRate = parseNumericValue(rate);
  const baseAmount = quantity * unitRate;
  return isPercentageUnit(unit) ? baseAmount / 100 : baseAmount;
};
