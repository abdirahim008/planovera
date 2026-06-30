// Content registry for the public /templates/[slug] pages.
//
// These are free, standalone SEO landing pages targeting low-competition,
// high-intent search terms (bill of quantities, interim payment certificate,
// etc. — see keyword research). Each page gives genuinely useful sample
// content, then offers the live, auto-calculated version inside Planovera.
//
// To add a new template page: add an entry here. app/templates/[slug]/page.tsx
// and app/sitemap.ts both read this registry, so a new entry is enough to
// produce a real, indexed page — no other code changes needed.

export type SampleRow =
  | { type: "section"; label: string }
  | { type: "item"; cells: string[] }
  | { type: "subtotal"; label: string; value: string }
  | { type: "total"; label: string; value: string };

export interface SampleTable {
  caption: string;
  columns: string[];
  rows: SampleRow[];
}

export interface SummaryBox {
  title: string;
  rows: { label: string; value: string; emphasis?: boolean }[];
}

export interface TemplatePageContent {
  slug: string;
  /** Page <title> (the layout adds " | Planovera"). Also used as the H1. */
  title: string;
  metaDescription: string;
  keywords: string[];
  kicker: string;
  intro: string;
  table: SampleTable;
  summaryBox?: SummaryBox;
  howToTitle: string;
  howToSteps: string[];
  faq: { q: string; a: string }[];
  ctaHeading: string;
  ctaBody: string;
  relatedSlugs: string[];
}

export const TEMPLATES: Record<string, TemplatePageContent> = {
  "interim-payment-certificate": {
    slug: "interim-payment-certificate",
    title: "Free Interim Payment Certificate (IPC) Template",
    metaDescription:
      "Free interim payment certificate (IPC) template and sample for FIDIC-style construction contracts — line items, retention, advance recovery and net amount due, explained.",
    keywords: [
      "interim payment certificate template",
      "interim payment certificate sample",
      "IPC template",
      "FIDIC payment certificate",
      "payment certificate software",
    ],
    kicker: "Free template",
    intro:
      "An Interim Payment Certificate (IPC) is the document an Engineer or Employer's Representative issues to certify the value of work a contractor has completed to date, so the contractor can be paid for it. Under FIDIC-style contracts (Sub-Clause 14.6), the Engineer values the work executed against the Bill of Quantities, deducts retention, any advance-payment recovery and applicable taxes, then certifies the net amount due — usually monthly. Below is a worked sample, followed by a step-by-step guide to preparing one.",
    table: {
      caption: "Sample — IPC No. 4, cumulative valuation",
      columns: ["Item", "Description", "Unit", "BOQ Qty", "Rate (USD)", "Cumulative Qty", "Amount (USD)"],
      rows: [
        { type: "section", label: "A — Roadworks" },
        { type: "item", cells: ["A.1", "Granular sub-base, 150 mm", "m³", "920", "28.00", "640", "17,920.00"] },
        { type: "item", cells: ["A.2", "Asphalt wearing course, 70 mm", "m²", "6,400", "14.50", "4,200", "60,900.00"] },
        { type: "subtotal", label: "Subtotal — Roadworks", value: "78,820.00" },
        { type: "section", label: "B — Drainage" },
        { type: "item", cells: ["B.1", "Precast concrete culvert pipe, 600 mm dia.", "m", "180", "62.00", "150", "9,300.00"] },
        { type: "item", cells: ["B.2", "Catch basin, type 2", "no.", "12", "410.00", "9", "3,690.00"] },
        { type: "subtotal", label: "Subtotal — Drainage", value: "12,990.00" },
        { type: "total", label: "Gross value of work executed to date", value: "91,810.00" },
      ],
    },
    summaryBox: {
      title: "Certificate summary — IPC No. 4",
      rows: [
        { label: "Gross valuation (cumulative to date)", value: "91,810.00" },
        { label: "Less: retention held (10%)", value: "(9,181.00)" },
        { label: "Less: advance payment recovery", value: "(4,000.00)" },
        { label: "Less: withholding tax (5%)", value: "(4,590.50)" },
        { label: "Less: certified in previous certificate (IPC No. 3)", value: "(58,200.00)" },
        { label: "Net amount due — this certificate", value: "15,838.50", emphasis: true },
      ],
    },
    howToTitle: "How to prepare an interim payment certificate",
    howToSteps: [
      "Start from the contract Bill of Quantities — the original quantities and agreed rates for every item.",
      "Measure or agree the cumulative quantity of each item executed to date (the Engineer's measurement, or the contractor's claim subject to the Engineer's review).",
      "Value the work: multiply cumulative quantity by the BOQ rate for each item, then sum to a gross valuation.",
      "Deduct retention at the percentage stated in the contract (commonly 5–10%, often capped at a maximum retention amount).",
      "Deduct recovery of any advance payment, per the recovery schedule or percentage agreed in the contract.",
      "Deduct withholding tax or other statutory deductions if applicable in the contract jurisdiction.",
      "Subtract the amount already certified in the previous IPC — the result is the net amount due for this period.",
      "The Engineer reviews and signs the certificate, then issues it to the Employer and Contractor within the contractual period (FIDIC Sub-Clause 14.6 typically allows 28 days from application).",
    ],
    faq: [
      {
        q: "What is an Interim Payment Certificate (IPC)?",
        a: "An IPC is a periodic certificate — usually monthly — that states the value of work a contractor has completed to date and the net amount currently due to be paid, after deductions like retention and advance recovery.",
      },
      {
        q: "Who issues an IPC?",
        a: "Under FIDIC-style contracts, the Engineer (or the Employer's Representative) values the work and issues the certificate, based on the contractor's application/claim and the Engineer's own measurement or review.",
      },
      {
        q: "How is an IPC different from a Final Payment Certificate?",
        a: "An IPC is interim — it certifies cumulative progress and is superseded by the next one. A Final Payment Certificate is issued once after the defects liability period ends, settling the full final account.",
      },
      {
        q: "What retention percentage is typical?",
        a: "It varies by contract, but 5–10% of certified value is common, often with a maximum retention cap (e.g. 2.5–5% of the contract price) and partial release at practical completion.",
      },
      {
        q: "Can an interim payment certificate be generated automatically?",
        a: "Yes — if your BOQ and cumulative quantities are already in a system, the gross valuation, retention, advance recovery and net amount due can all be calculated automatically rather than rebuilt in a spreadsheet every month.",
      },
    ],
    ctaHeading: "Stop rebuilding this certificate in Excel every month",
    ctaBody:
      "Planovera builds your IPC straight from your project's Bill of Quantities. Enter cumulative quantities and it calculates the gross valuation, retention, advance recovery, withholding tax and net amount due — and keeps every certificate in one place.",
    relatedSlugs: ["bill-of-quantities"],
  },

  "bill-of-quantities": {
    slug: "bill-of-quantities",
    title: "Free Bill of Quantities (BOQ) Template",
    metaDescription:
      "Free Bill of Quantities (BOQ) template and worked example for building and civil works — sections, items, units, quantities and rates, plus how to prepare one.",
    keywords: [
      "bill of quantities template excel",
      "boq template excel",
      "boq format in excel",
      "bill of quantities format in excel",
      "how to prepare a bill of quantities",
      "boq for residential building in excel",
    ],
    kicker: "Free template",
    intro:
      "A Bill of Quantities (BOQ) is an itemized list of the materials, labour and work sections needed to complete a construction project, each with a unit of measurement, a quantity, and (once priced) a rate and amount. It's the backbone of tendering — contractors price the same BOQ to produce comparable bids — and it stays in use through the project, feeding payment certificates and progress valuations. Below is a worked example for a small building, followed by a step-by-step guide to preparing one.",
    table: {
      caption: "Sample — residential building BOQ",
      columns: ["Item", "Description", "Unit", "Qty", "Rate (USD)", "Amount (USD)"],
      rows: [
        { type: "section", label: "A — Substructure" },
        { type: "item", cells: ["A.1", "Excavate foundation trench", "m³", "85", "8.50", "722.50"] },
        { type: "item", cells: ["A.2", "Mass concrete blinding, grade 10", "m³", "12", "95.00", "1,140.00"] },
        { type: "item", cells: ["A.3", "Reinforced concrete strip footing, grade 25", "m³", "28", "165.00", "4,620.00"] },
        { type: "subtotal", label: "Subtotal — Substructure", value: "6,482.50" },
        { type: "section", label: "B — Superstructure" },
        { type: "item", cells: ["B.1", "150 mm sandcrete blockwork walling", "m²", "310", "18.00", "5,580.00"] },
        { type: "item", cells: ["B.2", "Reinforced concrete columns, grade 25", "m³", "9", "210.00", "1,890.00"] },
        { type: "item", cells: ["B.3", "Reinforced concrete roof slab, 150 mm", "m²", "140", "62.00", "8,680.00"] },
        { type: "subtotal", label: "Subtotal — Superstructure", value: "16,150.00" },
        { type: "section", label: "C — Finishes" },
        { type: "item", cells: ["C.1", "Cement-sand plastering, internal and external", "m²", "560", "7.50", "4,200.00"] },
        { type: "item", cells: ["C.2", "Ceramic floor tiling", "m²", "180", "22.00", "3,960.00"] },
        { type: "subtotal", label: "Subtotal — Finishes", value: "8,160.00" },
        { type: "total", label: "Grand total carried to summary", value: "30,792.50" },
      ],
    },
    howToTitle: "How to prepare a bill of quantities",
    howToSteps: [
      "Break the works into logical sections — e.g. substructure, superstructure, finishes, external works — matching how the project will actually be built and measured.",
      "Take off quantities from the drawings and specification for every item ('quantity take-off'): lengths, areas, volumes or counts.",
      "Assign a standard unit of measurement to each item — m, m², m³, kg, no., sum/LS — following a recognized standard method of measurement where one applies.",
      "Write a clear, unambiguous description for each item, including material, grade/spec and any finish, so every bidder prices the same scope.",
      "For a tender BOQ, leave the rate and amount columns blank for contractors to price; for an internal estimate, insert your own rates.",
      "Subtotal each section, then sum all sections to a grand total carried to the tender/contract summary.",
      "Once awarded, the same BOQ becomes the pricing basis for valuing work executed — it feeds directly into progress reports and interim payment certificates.",
    ],
    faq: [
      {
        q: "What is a Bill of Quantities (BOQ)?",
        a: "A BOQ is an itemized list of a project's measured work — descriptions, units and quantities — used to obtain comparable tender prices and, once priced, to value and pay for work as it's completed.",
      },
      {
        q: "Who prepares a BOQ?",
        a: "Typically a quantity surveyor or estimator, working from architectural and engineering drawings and the project specification, following a standard method of measurement.",
      },
      {
        q: "What's the difference between a BOQ and a Bill of Materials?",
        a: "A BOQ measures construction work items (e.g. '150 mm sandcrete blockwork, 310 m²'), including labour and materials together. A Bill of Materials lists only the physical materials and components needed, without the measured-work framing.",
      },
      {
        q: "Do I need software to prepare a BOQ?",
        a: "No — a BOQ can be built in a spreadsheet. Software helps once you need consistent section totals, version control across tender revisions, and a direct link from the priced BOQ into payment certificates and progress valuation.",
      },
      {
        q: "Can a BOQ be generated automatically?",
        a: "Increasingly yes — describing the works in plain language (e.g. \"elevated steel water tank, septic tank, pump house\") can produce a structured, sectioned BOQ draft that a quantity surveyor then reviews and prices.",
      },
    ],
    ctaHeading: "Draft a BOQ in minutes, not hours",
    ctaBody:
      "Describe the works in plain language and Planovera's AI drafts a complete, sectioned BOQ for you to review and price. Built-in Excel paste/import, subtotal and grand-total rows, and the same figures flow straight into payment certificates and progress reports.",
    relatedSlugs: ["interim-payment-certificate"],
  },
};

export const TEMPLATE_SLUGS = Object.keys(TEMPLATES);
