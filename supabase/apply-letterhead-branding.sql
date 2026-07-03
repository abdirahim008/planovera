-- Letterhead branding: contact strip + accent colours for document letterheads.
-- Run once in the Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
--
-- Adds per-project issuer contact details (rendered in the letter footer as
-- "Tel · Email · Web") and the two accent colours used by the headed-letter
-- template (primary = tagline + main rule, secondary = contrast rule segment).

alter table public.projects add column if not exists issuer_phone text;
alter table public.projects add column if not exists issuer_email text;
alter table public.projects add column if not exists issuer_website text;
alter table public.projects add column if not exists brand_accent_primary text;
alter table public.projects add column if not exists brand_accent_secondary text;
