import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
const file = "C:\\Users\\zewo1\\OneDrive - brasurp.gov.so\\Desktop\\my projects\\BOQ library\\roads\\asphalt road\\asphalt concrete road.xlsx";
const wb = XLSX.read(readFileSync(file), { type: "buffer" });
console.log("Sheets:", JSON.stringify(wb.SheetNames));
for (const sn of wb.SheetNames) {
  const ws = wb.Sheets[sn];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  console.log("\n===== SHEET:", sn, "rows:", aoa.length, "=====");
  let lastNonEmpty = 0;
  aoa.forEach((r, i) => { if (r.some((c) => String(c).trim() !== "")) lastNonEmpty = i; });
  aoa.slice(0, lastNonEmpty + 1).forEach((r, i) => {
    const cells = r.map((c) => (c === "" ? "" : String(c))).slice(0, 7);
    if (cells.some((c) => c !== "")) console.log(i, JSON.stringify(cells));
  });
}
