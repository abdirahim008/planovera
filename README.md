# ProBuild — Construction & Project Management App

A full-featured project management application built for construction professionals (engineers, contractors, supervision teams, and clients/employers) as well as non-construction projects.

## Features

### Project Setup
- Select project type: **Construction** or **Non-Construction**
- Select your role: **Contractor**, **Supervision/Consultant**, or **Client/Employer**
- Role-based module visibility (payment certs only for supervision & employer)

### BOQ Module (Construction only)
- **Spreadsheet-like table** with Item No, Description, Unit, Quantity, Rate, Amount columns
- **Right-click context menu** with:
  - Add/delete rows
  - Convert rows to Section Header, Sub Total, or Grand Total
  - Copy/paste rows, move up/down
  - Insert special row types below
- **Row selection** by clicking the left gutter (row number)
- **Paste from Excel** — Ctrl+V tabular data directly into the table
- **Import from Excel** — Upload .xlsx/.xls/.csv files
- **Multi-sheet support** — add, rename (double-click tab), duplicate, or delete sheets
- **BOQ Library** — pick from admin-maintained ready-to-use BOQ templates
- **Save to Library** — save current BOQ as a reusable template
- Auto-calculation of amounts and subtotals/grand totals

### Simple Items Table (Non-Construction only)
- Simplified line items with auto-calculation

### Payment Certificates (Supervision & Employer roles)
- Generate **Interim** and **Final** payment certificates
- Fetches items from the BOQ automatically
- Previous quantities carry forward between certificates
- Editable "Current Qty" with auto-calculated cumulative values

### Work Plan
- Activities with description, duration, start date, and **auto-calculated end date**
- Fetch activities from BOQ or add manually
- Status tracking: Pending, In Progress, Completed, Delayed

### Admin Panel (`/admin`)
- Manage the BOQ Library — view, preview, and delete templates

---

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** (custom dark theme)
- **Zustand** (state management)
- **SheetJS (xlsx)** (Excel import/export)
- **Supabase** (database & auth — schema included)
- **Vercel** (deployment)

---

## Quick Start

### 1. Clone and install

```bash
cd probuild
npm install
```

### 2. Configure Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase-schema.sql`
3. Copy your project URL and anon key
4. Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Deploy to Vercel

```bash
npx vercel
```

Or connect your GitHub repo to Vercel and it will auto-deploy.

Add the Supabase environment variables in Vercel's project settings.

---

## Project Structure

```
probuild/
├── app/
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Main page (setup + workspace)
│   ├── globals.css         # Global styles + Tailwind
│   └── admin/
│       └── page.tsx        # Admin BOQ library page
├── components/
│   ├── ui/
│   │   ├── Button.tsx      # Reusable button
│   │   ├── Badge.tsx       # Status/category badge
│   │   ├── Modal.tsx       # Dialog modal
│   │   └── ContextMenu.tsx # Right-click context menu
│   ├── boq/
│   │   ├── BOQModule.tsx   # Full BOQ module (table, sheets, library, import)
│   │   └── SimpleItemsTable.tsx  # Simple table for non-construction
│   ├── payment/
│   │   └── PaymentModule.tsx     # Payment certificate generation
│   ├── workplan/
│   │   └── WorkPlanModule.tsx    # Work plan activities
│   ├── layout/
│   │   ├── Sidebar.tsx     # Navigation sidebar
│   │   └── Dashboard.tsx   # Dashboard with stats
│   └── admin/
│       └── AdminLibrary.tsx # Admin library management
├── lib/
│   ├── supabase.ts         # Supabase client + type definitions
│   ├── store.ts            # Zustand global state store
│   └── excel-utils.ts      # Excel/paste parsing utilities
├── supabase-schema.sql     # Database schema (run in Supabase SQL Editor)
├── tailwind.config.ts
├── tsconfig.json
├── next.config.js
├── package.json
└── .env.local              # Environment variables (not committed)
```

---

## Usage Tips

- **BOQ Paste from Excel**: Copy a range of cells from Excel (columns: Item No, Description, Unit, Qty, Rate, Amount), click the BOQ table area, and press Ctrl+V
- **Row Selection**: Click the row number on the left edge to select a row. Then right-click for context options including "Convert to Section Header"
- **Sheet Management**: Double-click a sheet tab to rename it
- **Payment Certificates**: Create your BOQ first, then go to Payments to generate certificates

---

## Notes

- The app currently uses **Zustand** for in-memory state. Data persists within a session but resets on reload.
- To enable full persistence, integrate the Supabase client calls in the store actions (the schema and types are ready).
- The BOQ Library ships with 3 sample templates (Road Works, Building Construction, Drainage Infrastructure).
