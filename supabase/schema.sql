-- Run once in Supabase > SQL Editor.

create table settings (
  id int primary key default 1 check (id = 1),
  store_name text not null default 'Pastelería',
  whatsapp_number text,             -- international format without "+", e.g. 5491112345678
  whatsapp_on boolean not null default true,
  email_on boolean not null default true
);
insert into settings default values;

create table categories (
  id bigint generated always as identity primary key,
  name text not null,
  sort int not null default 0
);

create table products (
  id bigint generated always as identity primary key,
  category_id bigint references categories on delete set null,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  lead_days int not null default 1 check (lead_days >= 0),
  images text[] not null default '{}' check (cardinality(images) <= 3),
  active boolean not null default true
);

create table variants (
  id bigint generated always as identity primary key,
  product_id bigint not null references products on delete cascade,
  name text not null,
  price numeric(12,2) check (price >= 0),  -- null = same price as the product
  active boolean not null default true
);

create table orders (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  customer_name text not null,
  phone text not null,
  delivery_date date not null,
  notes text,
  items jsonb not null,             -- [{name, variant, qty, price}] frozen at order time
  total numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending', 'delivered')),
  amount_received numeric(12,2),
  delivered_at timestamptz
);

-- Access: the public reads the active catalog; only the logged-in admin touches anything else.
-- Orders are inserted by the place-order function (service role), never directly by the public.
alter table settings enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table variants enable row level security;
alter table orders enable row level security;

grant select on settings, categories, products, variants to anon;
grant all on settings, categories, products, variants, orders to authenticated;

create policy "public read" on settings for select to anon using (true);
create policy "public read" on categories for select to anon using (true);
create policy "public read" on products for select to anon using (active);
create policy "public read" on variants for select to anon using (active);

create policy "admin" on settings for all to authenticated using (true) with check (true);
create policy "admin" on categories for all to authenticated using (true) with check (true);
create policy "admin" on products for all to authenticated using (true) with check (true);
create policy "admin" on variants for all to authenticated using (true) with check (true);
create policy "admin" on orders for all to authenticated using (true) with check (true);

-- Product images: public to view, only the admin uploads/deletes.
insert into storage.buckets (id, name, public) values ('products', 'products', true);
create policy "admin upload" on storage.objects for insert to authenticated with check (bucket_id = 'products');
create policy "admin delete" on storage.objects for delete to authenticated using (bucket_id = 'products');
