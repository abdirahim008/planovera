-- Adds the asset_type column to the shared drawing library so reusable PARTS
-- (beam sections, columns, footings, manholes… — cropped details placed on
-- package sheets) are distinguished from full DRAWING sheets.
--
-- 'object'          → reusable part
-- null / 'drawing'  → full drawing sheet (the default for everything existing)
--
-- Run once in the Supabase SQL Editor. Idempotent.

alter table public.drawing_library_items
  add column if not exists asset_type text;
