-- OUR LITTLE UNIVERSE V7: synchronize legacy category text with category_id.
-- V5 added a default 'Our Story' value to memories.category. V6 upload code
-- wrote category_id but omitted category, so new uploads appeared under Our Story.
-- This migration repairs existing rows; V7 upload code writes both columns.

update public.memories m
set category = c.name
from public.categories c
where m.category_id = c.id
  and (m.category is distinct from c.name);

-- Keep the category text aligned for future inserts that supply category_id only.
create or replace function public.sync_memory_category_from_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is not null then
    select c.name into new.category
    from public.categories c
    where c.id = new.category_id;
  end if;
  return new;
end;
$$;

drop trigger if exists memories_sync_category_from_id on public.memories;
create trigger memories_sync_category_from_id
before insert or update of category_id on public.memories
for each row execute function public.sync_memory_category_from_id();
