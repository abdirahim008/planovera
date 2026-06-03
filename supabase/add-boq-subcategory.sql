-- ============================================================================
-- add-boq-subcategory.sql  — idempotent migration
-- ----------------------------------------------------------------------------
-- Adds the `subcategory` column to public.boq_library_items so library
-- templates can be arranged by category AND subcategory. Run this once in the
-- Supabase SQL editor BEFORE running supabase/seed-boq-library.sql.
-- ============================================================================

alter table public.boq_library_items
  add column if not exists subcategory text not null default '';

-- Speeds up grouped browsing by category + subcategory.
create index if not exists boq_library_items_subcategory_idx
  on public.boq_library_items (category, subcategory);

-- Confirmation: show the column set so you can verify subcategory exists.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'boq_library_items'
order by ordinal_position;
