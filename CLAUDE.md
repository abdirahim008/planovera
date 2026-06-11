# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent Workflow
- You are the orchestrator. Break tasks into phases.
- For reasoning-heavy phases (architecture decisions, complex debugging,
  algorithm design), spawn a subagent using opus model.
- Handle coordination, file operations, and simple tasks yourself.

## Commands

- `npm run dev` — Next.js dev server on http://localhost:3000
- `npm run build` — production build (also the de-facto type-check; the project has no separate `tsc` script)
- `npm run start` — serve the built app
- `npm run lint` — `next lint` (config from `eslint-config-next`)

There is no test runner configured. Verify changes with `npm run build` plus manual checks in the browser.

## Environment

Two env vars drive Supabase wiring:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_AUTH_BYPASS` (optional) — `true|1|yes` forces demo mode, `false|0|no` forces real auth. If unset, demo mode is auto-enabled whenever the Supabase URL is missing or not a valid `http(s)` URL.

The bypass flag is computed once in [lib/demo-access.ts](lib/demo-access.ts) and consumed by both Supabase client wrappers and middleware. When `AUTH_BYPASS_ENABLED` is true the app runs entirely off Zustand local state — middleware short-circuits and `isSupabaseConfigured()` returns `false`. Treat that as a real product mode, not a bug: gate any new Supabase calls with `isSupabaseConfigured()` / `isServerSupabaseConfigured()` so the demo path still loads.

Database schema is in [supabase/schema.sql](supabase/schema.sql) — run it in Supabase SQL Editor. New profiles default to `role = 'engineer'`; admins are promoted via SQL update.

Note: the [README.md](README.md) describes an older, simpler tree (`probuild/` subfolder, no organization/drawings/api). The actual layout below is current; trust the code over the README.

## Architecture

Next.js 14 App Router, React 18, TypeScript strict, Tailwind. Path alias `@/*` → repo root (see [tsconfig.json](tsconfig.json)). `package.json` is still named `probuild` but the product is **Planovera** — a project-controls app (BOQ, payments, work plan, progress, documents, correspondence, checklist, site notes, meetings) with an integrated Fabric.js drawing studio.

### Routing & auth

[middleware.ts](middleware.ts) matches `["/", "/login", "/invite", "/organization/:path*", "/admin/:path*"]`. `/login` and `/invite` are public; everything else redirects unauthenticated users to `/login`. When `AUTH_BYPASS_ENABLED` or when env vars are missing/invalid, middleware no-ops and the app runs in demo mode.

Three Supabase surfaces — don't collapse them, each is the right tool in its layer:

- [lib/supabase-browser.ts](lib/supabase-browser.ts) — `createBrowserClient` singleton; returns `null` in demo mode or SSR.
- [lib/supabase-server.ts](lib/supabase-server.ts) — `createServerClient` bound to `next/headers` cookies for RSC pages and route handlers.
- [middleware.ts](middleware.ts) — `createServerClient` with `NextRequest`/`NextResponse` cookie shims; the only place that refreshes the auth cookies on the edge.

[lib/supabase.ts](lib/supabase.ts) is **not** a client wrapper — it's the ~870-line domain-types + record-mapper module (`Project`, `BOQRow`, `PaymentCertificate`, `ConstructionWorkspacePayload`, `mapProjectRecord`/`toProjectRecord`, `normalizeConstructionWorkspacePayload`, etc.). Treat it as the schema of the app state.

### State management — Zustand store

[lib/store.ts](lib/store.ts) (~3.7k lines) is the single global store, wrapped in `persist` (localStorage) **and** `temporal` from zundo (undo/redo). It owns every domain entity: projects, programs, categories, organizations, BOQ sheets, payment certificates, progress reports, work plans, generated documents, correspondence, checklists, site notes, meeting minutes, signature profile, etc.

Implications when changing state:

- Add new fields to both the runtime store and the matching `*Record` interface + `map*Record` / `to*Record` pair in [lib/supabase.ts](lib/supabase.ts), then to [lib/workspace-sync.ts](lib/workspace-sync.ts) if it should sync.
- New domain collections must be added to `ConstructionWorkspacePayload`, `emptyConstructionWorkspacePayload()`, and `normalizeConstructionWorkspacePayload()` — the normalizer is the safety net for persisted-but-out-of-date localStorage blobs.
- IDs are UUIDs minted with `uuid` (v4). Don't switch to `crypto.randomUUID()` ad hoc.

### Workspace sync

When Supabase is configured, the store is mirrored to per-project rows via `POST /api/workspace/sync` ([app/api/workspace/sync/route.ts](app/api/workspace/sync/route.ts)). The split is encoded in [lib/workspace-sync.ts](lib/workspace-sync.ts):

- **Project-scoped tables** (`boqDocuments`, `workPlans`, `simpleItemSets`, `certificates`, `progressReports`, `generatedDocuments`, `correspondenceRecords`) — keyed by `project_id`, scoped to an organization.
- **Workspace-owned tables** (`attendeeGroups`, `meetingMinutes`) — keyed by `owner_id`.

`buildRelationalWorkspacePayload` / `mergeWorkspacePayloadSources` reconstruct the in-memory `ConstructionWorkspacePayload` from these rows; `buildProjectSyncSignature` is the diff key the client uses to decide when to push. Keep this contract symmetric — adding a collection to one side without the other will silently drop data on reload.

There are also two import endpoints under [app/api/imports/](app/api/imports) (`final-certificate-test`, `surp2-mogadishu`) that translate external workbooks into store-shaped payloads using the types in [lib/finalCertificateImportTypes.ts](lib/finalCertificateImportTypes.ts) and [lib/surp2ImportTypes.ts](lib/surp2ImportTypes.ts).

### UI shell

[app/page.tsx](app/page.tsx) is an RSC that gates on Supabase auth (when configured) and renders [components/layout/WorkspaceShell.tsx](components/layout/WorkspaceShell.tsx). The shell is the central `"use client"` component: it owns active-module switching, project/program/org selection, the sidebar, the dashboard, and per-module mounts. Modules live under `components/<domain>/`:

- `boq/` — [BOQModule.tsx](components/boq/BOQModule.tsx) (~2.2k lines): spreadsheet-style BOQ with multi-sheet tabs, Excel paste/import via [lib/excel-utils.ts](lib/excel-utils.ts), right-click context menu, section/subtotal/grand-total row types, library save/load.
- `payment/`, `workplan/`, `progress/`, `documents/`, `correspondence/`, `checklist/`, `site-notes/`, `meetings/` — each is one or two top-level module components driving the store.
- `organization/OrganizationWorkspace.tsx` — org/program/project/category management plus member invites and billing display (uses [lib/subscriptions.ts](lib/subscriptions.ts)).
- `admin/` — admin panel mounted at `/admin` for managing the BOQ library.
- `ui/` — shared primitives (Button, Badge, Modal, ContextMenu).

Domain calculations live in dedicated modules — don't inline them in components:

- [lib/boq-calculations.ts](lib/boq-calculations.ts) — line amount, percentage units.
- [lib/payment-calculations.ts](lib/payment-calculations.ts) — FIDIC-style cert math (retention, advance recovery, withholding, contingencies, line state).
- [lib/projectCategories.ts](lib/projectCategories.ts), [lib/somaliaLocations.ts](lib/somaliaLocations.ts), [lib/richText.ts](lib/richText.ts) — reference data + sanitizer.

### Drawing studio (integrated sub-app)

The Fabric.js engineering-drawing editor is reachable at `/drawings/studio` ([app/drawings/studio/page.tsx](app/drawings/studio/page.tsx) → [components/drawings/DrawingStudioRoute.tsx](components/drawings/DrawingStudioRoute.tsx)) and embedded inside the workspace via `components/drawings/ConstructionDrawingsModule.tsx`. Its support code lives under [lib/drawings/](lib/drawings):

- `appModel.ts`, `fabricHelpers.ts`, `paper.ts`, `snapping.ts`, `patterns.ts`, `parametricBlocks.ts`

Fabric is browser-only — keep its imports dynamic (`await import("fabric")`) inside `"use client"` components, never top-level in a module that could be SSR-evaluated.

## Conventions worth preserving

- Demo-mode-safe code: every Supabase-touching path checks `isSupabaseConfigured()` / `isServerSupabaseConfigured()` first and falls back to local state. New code must do the same.
- Snake_case in database/`*Record` types, camelCase in in-memory types. The `map*Record` / `to*Record` pairs in [lib/supabase.ts](lib/supabase.ts) are the only bridge — extend them in lockstep.
- All numeric inputs in BOQ/payment/work-plan rows are stored as **strings** (raw user input), not numbers. `boq-calculations` / `payment-calculations` are the only places that parse and compute.
- The Zustand store is wrapped in `temporal(...)` for undo; mutations should go through store actions so they land in the history stack.
- `normalizeConstructionWorkspacePayload` is the migration seam for persisted state — when adding a new collection, add a default there or older clients will crash on reload.
- Middleware matchers are the authoritative list of protected paths. Adding a new authenticated route means editing the `matcher` array, not relying on the `app/` directory shape.
