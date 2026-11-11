
-- MenuSnap database setup
-- These tables use the ms_ prefix to avoid conflicts with existing tables.

create table if not exists public.ms_restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ms_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.ms_restaurants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ms_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.ms_restaurants(id) on delete cascade,
  category_id uuid references public.ms_categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null default 0 check (price >= 0),
  image_url text,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ms_restaurants enable row level security;
alter table public.ms_categories enable row level security;
alter table public.ms_menu_items enable row level security;

drop policy if exists "ms_restaurant_owner_all" on public.ms_restaurants;
create policy "ms_restaurant_owner_all" on public.ms_restaurants
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "ms_restaurant_public_read" on public.ms_restaurants;
create policy "ms_restaurant_public_read" on public.ms_restaurants
for select to anon, authenticated
using (is_published = true);

drop policy if exists "ms_category_owner_all" on public.ms_categories;
create policy "ms_category_owner_all" on public.ms_categories
for all to authenticated
using (
  exists (
    select 1 from public.ms_restaurants r
    where r.id = restaurant_id and r.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.ms_restaurants r
    where r.id = restaurant_id and r.owner_id = auth.uid()
  )
);

drop policy if exists "ms_category_public_read" on public.ms_categories;
create policy "ms_category_public_read" on public.ms_categories
for select to anon, authenticated
using (
  exists (
    select 1 from public.ms_restaurants r
    where r.id = restaurant_id and r.is_published = true
  )
);

drop policy if exists "ms_item_owner_all" on public.ms_menu_items;
create policy "ms_item_owner_all" on public.ms_menu_items
for all to authenticated
using (
  exists (
    select 1 from public.ms_restaurants r
    where r.id = restaurant_id and r.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.ms_restaurants r
    where r.id = restaurant_id and r.owner_id = auth.uid()
  )
);

drop policy if exists "ms_item_public_read" on public.ms_menu_items;
create policy "ms_item_public_read" on public.ms_menu_items
for select to anon, authenticated
using (
  exists (
    select 1 from public.ms_restaurants r
    where r.id = restaurant_id and r.is_published = true
  )
);

grant select, insert, update, delete on public.ms_restaurants to authenticated;
grant select on public.ms_restaurants to anon;
grant select, insert, update, delete on public.ms_categories to authenticated;
grant select on public.ms_categories to anon;
grant select, insert, update, delete on public.ms_menu_items to authenticated;
grant select on public.ms_menu_items to anon, authenticated;
