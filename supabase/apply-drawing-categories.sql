-- Sector-relevant warehouse categories.
-- Replaces the legacy CAD-style taxonomy (layouts/structural/mechanical/
-- electrical/civil/details) with what engineers actually filter by:
--   water · sanitation · drainage · roads · buildings · electrical · details
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Replace the category check constraint (the table was once named
--    library_items, so the inline check may carry either name).
alter table public.drawing_library_items
  drop constraint if exists drawing_library_items_category_check;
alter table public.drawing_library_items
  drop constraint if exists library_items_category_check;

-- Temporarily allow both taxonomies while rows are recategorized.
alter table public.drawing_library_items
  add constraint drawing_library_items_category_check
  check (category in (
    'water', 'sanitation', 'drainage', 'roads', 'buildings', 'electrical', 'details',
    'layouts', 'structural', 'mechanical', 'civil'
  ));

-- 2. Recategorize existing rows by keywords in the name and tags.
--    Rules run most-specific first; each only claims rows still on a legacy
--    category, so earlier assignments are never overwritten.

-- Drainage: manholes, catch basins, culverts, channels, gullies, stormwater.
update public.drawing_library_items
set category = 'drainage'
where category in ('layouts', 'structural', 'mechanical', 'civil', 'details')
  and (
    name ~* 'manhole|catch basin|culvert|drain|gully|gulley|channel|storm ?water|soak ?away'
    or tags && array['manhole','catch basin','culvert','drainage','drain','gully','channel','stormwater']
  );

-- Sanitation: latrines, septic tanks, toilets, hygiene facilities.
update public.drawing_library_items
set category = 'sanitation'
where category in ('layouts', 'structural', 'mechanical', 'civil', 'details')
  and (
    name ~* 'latrine|septic|toilet|sanitat|hygiene|hand ?wash|ablution'
    or tags && array['latrine','septic','toilet','sanitation','hygiene','handwashing']
  );

-- Water: boreholes, kiosks, tanks, pipelines, pumps, wells.
update public.drawing_library_items
set category = 'water'
where category in ('layouts', 'structural', 'mechanical', 'civil', 'details')
  and (
    name ~* 'borehole|water|kiosk|tank|pipeline|pipe ?work|pump|well|reservoir|standpipe'
    or tags && array['borehole','water','kiosk','tank','pipeline','pump','well','water supply']
  );

-- Roads & transport: kerbs, barriers, signage, humps, sidewalks, pavements.
update public.drawing_library_items
set category = 'roads'
where category in ('layouts', 'structural', 'mechanical', 'civil', 'details')
  and (
    name ~* 'road|kerb|curb|barrier|sign|speed hump|speed bump|sidewalk|pavement|median|island|marking|crossing|guardrail|traffic'
    or tags && array['road','kerb','barrier','signage','road sign','traffic signs','sidewalk','pavement','roadway','traffic calming','road marking']
  );

-- Electrical & solar: lighting, solar, power.
update public.drawing_library_items
set category = 'electrical'
where category in ('layouts', 'structural', 'mechanical', 'civil', 'details')
  and (
    name ~* 'solar|light|electric|power|street ?light|floodlight'
    or tags && array['solar','lighting','electrical','street light','power']
  );

-- Buildings & shelter: layouts, structural frames, roofs, foundations, rooms.
update public.drawing_library_items
set category = 'buildings'
where category in ('layouts', 'structural', 'mechanical', 'civil', 'details')
  and (
    name ~* 'building|shelter|classroom|office|roof|foundation|column|beam|slab|wall|door|window|stair|layout|plan|elevation|section'
    or tags && array['building','shelter','structural','roof','foundation','layout','stairs']
  );

-- Anything still on a legacy id becomes a general detail.
update public.drawing_library_items
set category = case
  when category in ('layouts', 'structural') then 'buildings'
  else 'details'
end
where category in ('layouts', 'structural', 'mechanical', 'civil');

-- 3. Tighten the constraint to the sector taxonomy only.
alter table public.drawing_library_items
  drop constraint if exists drawing_library_items_category_check;
alter table public.drawing_library_items
  add constraint drawing_library_items_category_check
  check (category in ('water', 'sanitation', 'drainage', 'roads', 'buildings', 'electrical', 'details'));

-- 4. Review the result (run separately if you want to spot-check):
-- select category, count(*) from public.drawing_library_items group by category order by 2 desc;
-- select name, category from public.drawing_library_items order by category, name;
