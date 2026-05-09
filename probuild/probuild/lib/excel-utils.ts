import { v4 as uuid } from "uuid";
import type { BOQRow } from "./supabase";
import { calculateBOQLineAmount } from "./boq-calculations";

export type BOQColumnKey = "itemNo" | "description" | "unit" | "qty" | "rate" | "amount";
export type BOQMappedColumnKey = BOQColumnKey | "ignore";

export type RawExcelSheet = {
  name: string;
  rows: string[][];
};

export type BOQColumnMapping = {
  index: number;
  target: BOQMappedColumnKey;
};

/**
 * Parse tab-separated text (from clipboard paste) into BOQ rows.
 * Expects columns in order: Item No | Description | Unit | Qty | Rate | Amount
 * Flexible: handles 2-6 columns. Extra columns are ignored.
 */
export function parsePastedText(text: string): BOQRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const rows: BOQRow[] = [];

  for (const line of lines) {
    const cols = line.split("\t").map((c) => c.trim());
    if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

    const row: BOQRow = {
      id: uuid(),
      type: "item",
      itemNo: cols[0] || "",
      description: cols[1] || "",
      unit: cols[2] || "",
      qty: cols[3] || "",
      rate: cols[4] || "",
      amount: cols[5] || "",
    };

    // Auto-calculate amount if qty and rate exist but amount doesn't
    if (row.qty && row.rate && !row.amount) {
      const q = parseFloat(row.qty);
      const r = parseFloat(row.rate);
      if (!isNaN(q) && !isNaN(r)) {
        row.amount = calculateBOQLineAmount(q, r, row.unit).toFixed(2);
      }
    }

    rows.push(row);
  }

  return rows;
}

const normalizeHeader = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]/g, "");

const defaultBOQTargets: BOQColumnKey[] = ["itemNo", "description", "unit", "qty", "rate", "amount"];

const columnKeywordMatchers: Array<{ target: BOQColumnKey; matches: (v: string) => boolean }> = [
  { target: "itemNo", matches: (v) => /item(no|number|#)?|billno|serial|s\/?n/.test(v) },
  { target: "description", matches: (v) => /desc|description|workitem|particular/.test(v) },
  { target: "unit", matches: (v) => /^unit$|uom|measure/.test(v) },
  { target: "qty", matches: (v) => /^qty$|quantity|quant/.test(v) },
  { target: "rate", matches: (v) => /^rate$|unitrate|price/.test(v) },
  { target: "amount", matches: (v) => /amount|total|value|sum/.test(v) },
];

const createInitialMapping = (rows: string[][]): BOQColumnMapping[] => {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const headerRow = rows.find((r) => r.some((c) => c.trim())) || [];
  const mapping: BOQColumnMapping[] = Array.from({ length: maxCols }, (_, index) => ({
    index,
    target: "ignore",
  }));
  const usedTargets = new Set<BOQColumnKey>();

  // 1) header-based mapping
  for (let i = 0; i < maxCols; i++) {
    const normalized = normalizeHeader(headerRow[i] || "");
    if (!normalized) continue;
    const match = columnKeywordMatchers.find((m) => m.matches(normalized));
    if (!match || usedTargets.has(match.target)) continue;
    mapping[i].target = match.target;
    usedTargets.add(match.target);
  }

  // 2) positional fallback for remaining columns
  for (let i = 0; i < maxCols; i++) {
    if (mapping[i].target !== "ignore") continue;
    const nextTarget = defaultBOQTargets.find((t) => !usedTargets.has(t));
    if (!nextTarget) continue;
    mapping[i].target = nextTarget;
    usedTargets.add(nextTarget);
  }

  return mapping;
};

export function mapRawSheetToBOQRows(
  rawSheet: RawExcelSheet,
  columnMapping: BOQColumnMapping[],
  options?: { skipDetectedHeaderRow?: boolean }
): BOQRow[] {
  const rows: BOQRow[] = [];
  let headerSkipped = false;

  for (const rowData of rawSheet.rows) {
    const cols = rowData.map((c: any) => String(c ?? "").trim());
    if (cols.every((c) => !c)) continue;

    if (options?.skipDetectedHeaderRow !== false && !headerSkipped) {
      const lowerJoined = cols.join(" ").toLowerCase();
      if (lowerJoined.includes("item") && (lowerJoined.includes("description") || lowerJoined.includes("unit"))) {
        headerSkipped = true;
        continue;
      }
      headerSkipped = true;
    }

    const mappedValues: Record<BOQColumnKey, string> = {
      itemNo: "",
      description: "",
      unit: "",
      qty: "",
      rate: "",
      amount: "",
    };

    for (const map of columnMapping) {
      if (map.target === "ignore") continue;
      mappedValues[map.target] = cols[map.index] || "";
    }

    const row: BOQRow = {
      id: uuid(),
      type: "item",
      itemNo: mappedValues.itemNo,
      description: mappedValues.description,
      unit: mappedValues.unit,
      qty: mappedValues.qty,
      rate: mappedValues.rate,
      amount: mappedValues.amount,
    };

    const onlyDescriptionHasValue =
      !row.itemNo &&
      !!row.description &&
      !row.unit &&
      !row.qty &&
      !row.rate &&
      !row.amount;
    if (onlyDescriptionHasValue) row.type = "header";

    if (row.qty && row.rate && !row.amount) {
      const q = parseFloat(row.qty);
      const r = parseFloat(row.rate);
      if (!isNaN(q) && !isNaN(r)) row.amount = calculateBOQLineAmount(q, r, row.unit).toFixed(2);
    }

    rows.push(row);
  }

  return rows;
}

export async function parseExcelToRawSheets(file: File): Promise<RawExcelSheet[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheets: RawExcelSheet[] = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: "",
    });
    const rows = jsonData.map((row) => row.map((c: any) => String(c ?? "").trim()));
    if (rows.some((r) => r.some((c) => c))) {
      sheets.push({ name: sheetName, rows });
    }
  }
  return sheets;
}

export function createDefaultColumnMapping(rawSheet: RawExcelSheet): BOQColumnMapping[] {
  return createInitialMapping(rawSheet.rows);
}

/**
 * Parse an Excel file (using SheetJS/xlsx) into BOQ rows.
 * Returns an array of sheets, each containing an array of rows.
 */
export async function parseExcelFile(
  file: File
): Promise<{ name: string; rows: BOQRow[] }[]> {
  const rawSheets = await parseExcelToRawSheets(file);
  return rawSheets
    .map((rawSheet) => {
      const mapping = createDefaultColumnMapping(rawSheet);
      return {
        name: rawSheet.name,
        rows: mapRawSheetToBOQRows(rawSheet, mapping),
      };
    })
    .filter((s) => s.rows.length > 0);
}
