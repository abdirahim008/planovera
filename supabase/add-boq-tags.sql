-- ============================================================================
-- add-boq-tags.sql  — idempotent migration
-- ----------------------------------------------------------------------------
-- Adds the `tags` column to public.boq_library_items so library templates can
-- be found by free-text keywords (e.g. "borehole", "uPVC", "water tank").
-- Run this once in the Supabase SQL editor BEFORE running
-- supabase/seed-wash-boq-library.sql.
-- ============================================================================

alter table public.boq_library_items
  add column if not exists tags text[] not null default '{}';

-- GIN index speeds up keyword/contains lookups against the tags array.
create index if not exists boq_library_items_tags_idx
  on public.boq_library_items using gin (tags);

-- Confirmation: show the column set so you can verify tags exists.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'boq_library_items'
order by ordinal_position;
