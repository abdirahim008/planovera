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
    relatedSlugs: ["bill-of-quantities", "construction-progress-report"],
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
    relatedSlugs: ["interim-payment-certificate", "construction-work-plan", "construction-progress-report"],
  },

  "construction-progress-report": {
    slug: "construction-progress-report",
    title: "Free Construction Progress Report Template",
    metaDescription:
      "Free construction progress report template — a worked weighted-progress example (planned vs actual, earned value) plus a step-by-step guide to reporting site progress.",
    keywords: [
      "construction progress report template",
      "construction progress report sample",
      "weekly construction progress report",
      "construction progress report format",
      "monthly report format for construction project",
      "construction project progress report template",
    ],
    kicker: "Free template",
    intro:
      "A construction progress report tracks how much of the work has actually been completed against the planned schedule — usually expressed as a weighted percentage complete, broken down by section. It compares planned % to actual % per item, rolls up to an overall progress figure, and in its fullest form converts that into earned value against the contract sum. Below is a worked example, followed by a step-by-step guide to building one.",
    table: {
      caption: "Sample — Progress Report No. 6, weighted progress",
      columns: ["Item", "Description", "Weight (%)", "Planned (%)", "Actual (%)", "Earned (%)"],
      rows: [
        { type: "section", label: "A — Substructure (weight 20%)" },
        { type: "item", cells: ["A.1", "Excavation and foundations", "10.0", "100.0", "100.0", "10.0"] },
        { type: "item", cells: ["A.2", "Reinforced concrete footings", "10.0", "100.0", "90.0", "9.0"] },
        { type: "subtotal", label: "Subtotal — Substructure", value: "19.0" },
        { type: "section", label: "B — Superstructure (weight 35%)" },
        { type: "item", cells: ["B.1", "Blockwork walling", "20.0", "80.0", "65.0", "13.0"] },
        { type: "item", cells: ["B.2", "Reinforced concrete roof slab", "15.0", "50.0", "30.0", "4.5"] },
        { type: "subtotal", label: "Subtotal — Superstructure", value: "17.5" },
        { type: "section", label: "C — Finishes (weight 25%)" },
        { type: "item", cells: ["C.1", "Plastering and painting", "15.0", "20.0", "5.0", "0.8"] },
        { type: "item", cells: ["C.2", "Floor tiling", "10.0", "10.0", "0.0", "0.0"] },
        { type: "subtotal", label: "Subtotal — Finishes", value: "0.8" },
        { type: "section", label: "D — MEP & external works (weight 20%)" },
        { type: "item", cells: ["D.1", "Electrical and plumbing first fix", "12.0", "15.0", "5.0", "0.6"] },
        { type: "item", cells: ["D.2", "External works and landscaping", "8.0", "5.0", "0.0", "0.0"] },
        { type: "subtotal", label: "Subtotal — MEP & external works", value: "0.6" },
        { type: "total", label: "Overall weighted progress (actual)", value: "37.9%" },
      ],
    },
    summaryBox: {
      title: "Progress summary — Report No. 6",
      rows: [
        { label: "Planned progress to date", value: "49.7%" },
        { label: "Actual progress to date", value: "37.9%" },
        { label: "Schedule variance", value: "-11.8%" },
        { label: "Earned value (of USD 850,000 contract)", value: "USD 322,150.00", emphasis: true },
      ],
    },
    howToTitle: "How to build a construction progress report",
    howToSteps: [
      "List the work breakdown structure — sections and items — and assign each a weight (% of total contract value or effort), summing to 100%.",
      "Set the planned % complete for each item from the approved baseline programme/work plan for the reporting date.",
      "Record the actual % complete for each item, measured or assessed on site for the reporting date.",
      "Calculate earned % per item: weight × actual % complete.",
      "Sum earned % across all items for the overall actual progress to date, and do the same with planned % for the baseline.",
      "Compare actual vs planned to get the schedule variance, and flag the items furthest behind for corrective action.",
      "Convert earned % to earned value in money terms (weight × actual % × contract value) to report progress against the commercial baseline too.",
      "Issue the report on a consistent cycle — weekly or monthly — so the trend, not just a single snapshot, is visible over time.",
    ],
    faq: [
      {
        q: "What is a construction progress report?",
        a: "A periodic report — usually weekly or monthly — that states how much of the contracted work has been completed, broken down by section, and compares it against the planned schedule.",
      },
      {
        q: "What's the difference between planned % and actual % complete?",
        a: "Planned % is what the baseline programme says should be complete by the reporting date. Actual % is what has genuinely been measured or assessed as complete on site. The gap between them is the schedule variance.",
      },
      {
        q: "What is earned value in a progress report?",
        a: "Earned value converts physical progress into money: it's the weight (or BOQ value) of an item multiplied by its actual % complete, summed across the project. It lets you compare physical progress directly against amounts certified for payment.",
      },
      {
        q: "How often should progress reports be issued?",
        a: "Most contracts expect monthly reports alongside the payment certificate cycle; many project teams also track progress weekly internally to catch slippage earlier.",
      },
      {
        q: "Can progress reports be generated automatically from a BOQ or work plan?",
        a: "Yes — if items are already weighted (e.g. from a priced BOQ), the planned baseline can come from the work plan, and an engineer only needs to enter actual % or quantities each period rather than rebuilding the report from scratch.",
      },
    ],
    ctaHeading: "Track progress without rebuilding the S-curve every period",
    ctaBody:
      "Planovera ties your progress report straight to your BOQ or work plan — items are weighted automatically, you enter actual % or quantities, and the planned-vs-actual variance and earned value are calculated for you, period after period.",
    relatedSlugs: ["bill-of-quantities", "construction-work-plan", "interim-payment-certificate"],
  },

  "practical-completion-certificate": {
    slug: "practical-completion-certificate",
    title: "Free Practical Completion Certificate Template",
    metaDescription:
      "Free practical completion certificate template and worked example — what it certifies, what starts the defects liability period, and how retention is released.",
    keywords: [
      "practical completion certificate template",
      "certificate of practical completion sample",
      "construction practical completion certificate template",
    ],
    kicker: "Free template",
    intro:
      "A Certificate of Practical Completion is issued when the works (or a defined section) are complete enough for their intended use, subject only to minor outstanding items. It matters beyond paperwork: its date starts the defects liability period, triggers partial release of retention, and shifts risk and insurance responsibility toward the employer. Below is a worked example, followed by what needs to be confirmed before issuing one.",
    table: {
      caption: "Sample — Certificate of Practical Completion",
      columns: ["Field", "Detail"],
      rows: [
        { type: "section", label: "Project details" },
        { type: "item", cells: ["Project", "Riverside Avenue Upgrade — Package 2"] },
        { type: "item", cells: ["Contract No.", "RAU-PKG2-2026"] },
        { type: "item", cells: ["Contractor", "ABC Construction Ltd"] },
        { type: "item", cells: ["Employer", "City Roads Authority"] },
        { type: "section", label: "Certification" },
        { type: "item", cells: ["Date of practical completion", "2026-08-15"] },
        { type: "item", cells: ["Outstanding minor items (snag list)", "Attached — 6 items, to be completed within 14 days"] },
        { type: "item", cells: ["Defects liability period", "12 months from the above date"] },
        { type: "item", cells: ["Retention released on this certificate", "50% of retention held"] },
        { type: "total", label: "Status", value: "Practically complete" },
      ],
    },
    howToTitle: "What to confirm before issuing the certificate",
    howToSteps: [
      "Confirm the works (or the relevant section) are complete enough for their intended use, with only minor outstanding items ('snags') remaining.",
      "Carry out a joint inspection with the contractor and record any outstanding minor defects or items as a snag list, with a date for completion.",
      "Confirm the contractor has provided the handover items due at this stage — as-built drawings, O&M manuals, test certificates, warranties.",
      "State the date of practical completion — this is what starts the defects liability period, not the certificate's issue date.",
      "Record the defects liability (or maintenance) period length per the contract, and the date it ends.",
      "State any retention released on issue of this certificate, per the contract terms — often a partial release, with the balance held until the defects liability period ends.",
      "The Engineer or certifier signs and issues the certificate to both the Employer and the Contractor.",
    ],
    faq: [
      {
        q: "What is a practical completion certificate?",
        a: "A certificate confirming the works (or a section) are complete enough for their intended use, subject only to minor outstanding items. It is a key contractual milestone, not just a record.",
      },
      {
        q: "What's the difference between practical completion and final completion?",
        a: "Practical completion starts the defects liability period and usually releases part of the retention. Final completion happens after that period ends, once outstanding defects are remedied, and settles the final account.",
      },
      {
        q: "Does practical completion release all retention?",
        a: "Usually not — most contracts release only a portion (often half) of retention at practical completion, holding the rest until the defects liability period ends and final completion is certified.",
      },
      {
        q: "What happens if there's a snag list at practical completion?",
        a: "Minor outstanding items don't prevent practical completion as long as they don't stop the works being used for their intended purpose. They're recorded as a snag list with a completion deadline, tracked separately from the certificate itself.",
      },
      {
        q: "Who issues the certificate of practical completion?",
        a: "Under FIDIC-style contracts, the Engineer issues it, typically after a joint inspection with the contractor and a review of outstanding items and handover documentation.",
      },
    ],
    ctaHeading: "Issue completion certificates without starting from a blank page",
    ctaBody:
      "Planovera drafts the certificate body for you from your project's real details and dates — describe what's complete to the AI assistant and review the draft in minutes, instead of writing it from scratch.",
    relatedSlugs: ["interim-payment-certificate", "bill-of-quantities"],
  },

  "construction-work-plan": {
    slug: "construction-work-plan",
    title: "Free Construction Work Plan Template",
    metaDescription:
      "Free construction work plan (programme) template — a worked activity schedule with durations and milestones, plus how to build one from a bill of quantities.",
    keywords: [
      "construction work plan template",
      "construction work plan format",
      "construction work plan sample",
      "construction work plan example",
      "program of works construction template",
    ],
    kicker: "Free template",
    intro:
      "A construction work plan (or programme) sequences the project's activities with realistic durations, start/finish dates and key milestones — the baseline everything else (progress reports, payment timing, resourcing) gets measured against. Below is a worked example for a small building project, followed by a step-by-step guide to building one.",
    table: {
      caption: "Sample — construction work plan",
      columns: ["Activity", "Duration (days)", "Start", "Finish", "Status"],
      rows: [
        { type: "section", label: "Site establishment" },
        { type: "item", cells: ["Mobilization and site setup", "7", "2026-01-15", "2026-01-21", "Complete"] },
        { type: "section", label: "Substructure" },
        { type: "item", cells: ["Excavation and foundations", "14", "2026-01-22", "2026-02-04", "Complete"] },
        { type: "item", cells: ["Reinforced concrete footings", "10", "2026-02-05", "2026-02-14", "In progress"] },
        { type: "section", label: "Superstructure" },
        { type: "item", cells: ["Blockwork walling", "21", "2026-02-15", "2026-03-07", "Pending"] },
        { type: "item", cells: ["Roof structure and covering", "12", "2026-03-08", "2026-03-19", "Pending"] },
        { type: "section", label: "Finishes & handover" },
        { type: "item", cells: ["Plastering, painting, finishes", "18", "2026-03-20", "2026-04-06", "Pending"] },
        { type: "item", cells: ["Testing, commissioning, handover", "5", "2026-04-07", "2026-04-11", "Pending — milestone"] },
        { type: "total", label: "Total programme duration", value: "87 days" },
      ],
    },
    summaryBox: {
      title: "Programme summary",
      rows: [
        { label: "Programme start", value: "2026-01-15" },
        { label: "Programme finish", value: "2026-04-11" },
        { label: "Total duration", value: "87 working days" },
        { label: "Milestones", value: "1 — testing, commissioning & handover", emphasis: true },
      ],
    },
    howToTitle: "How to build a construction work plan",
    howToSteps: [
      "Break the works into a logical work breakdown structure — sections and activities — matching how the project will actually be built and sequenced.",
      "Estimate a realistic duration for each activity based on production rates, crew size and quantities, often taken straight from the priced BOQ.",
      "Sequence activities in construction order, respecting genuine dependencies — e.g. footings before walls, walls before roof.",
      "Assign start and finish dates by chaining durations from the agreed project start date, or use a proper critical-path/Gantt tool once the plan has many dependencies.",
      "Flag key dates as milestones — practical completion, major handovers, regulatory inspections — so they're easy to track separately from routine activities.",
      "Set a status for each activity (pending, in progress, completed, delayed) and update it as the project proceeds.",
      "Re-baseline or revise the plan when real progress diverges materially from plan, and keep the original baseline for variance reporting.",
    ],
    faq: [
      {
        q: "What is a construction work plan (programme)?",
        a: "A sequenced schedule of the project's activities with durations and start/finish dates, used to plan the works and as the baseline that actual progress is measured against.",
      },
      {
        q: "What's the difference between a work plan and a progress report?",
        a: "The work plan is the baseline — what should happen and when. A progress report measures what has actually happened against that baseline, on a recurring cycle.",
      },
      {
        q: "How detailed should a construction programme be?",
        a: "Detailed enough to genuinely manage the work — typically one activity per significant trade or work section per area — without so much detail that it becomes impractical to keep updated.",
      },
      {
        q: "What is a milestone in a construction programme?",
        a: "A key date worth tracking on its own — practical completion, a major handover, a regulatory inspection — flagged separately from routine activities so it stands out in reporting.",
      },
      {
        q: "Should the work plan match the BOQ structure?",
        a: "It helps a great deal — when work-plan sections mirror BOQ sections, progress, payment valuation and scheduling all reference the same structure instead of three different breakdowns of the same project.",
      },
    ],
    ctaHeading: "Build a work plan from your BOQ — not from scratch",
    ctaBody:
      "Planovera can generate a sequenced work plan with durations directly from your project's Bill of Quantities, or describe the works to the AI assistant and get a draft schedule in minutes.",
    relatedSlugs: ["bill-of-quantities", "construction-progress-report"],
  },
};

export const TEMPLATE_SLUGS = Object.keys(TEMPLATES);
