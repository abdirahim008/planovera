-- Warehouse editing fidelity: store structured Fabric object JSON alongside
-- the SVG for drawing library items. SVG flattens grouping on re-import;
-- fabric_json preserves the admin's grouping and parametric block metadata,
-- so warehouse curation persists across insert and re-edit.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
-- RLS is unchanged: reads for all authenticated users, writes admin-only.

alter table public.drawing_library_items add column if not exists fabric_json jsonb;
