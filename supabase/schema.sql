-- Run once in Supabase > SQL Editor.

create table settings (
  id int primary key default 1 check (id = 1),
  store_name text not null default 'Pastelería',
  whatsapp_number text,             -- international format without "+", e.g. 5491112345678
  whatsapp_on boolean not null default true,
  email_on boolean not null default true,
  transfer_alias text,              -- shown to the customer after ordering, to pay by bank transfer
  transfer_holder text,             -- account holder (and bank) so the customer can check before sending
  show_categories boolean not null default true  -- category pills in the shop; off while the catalog is small
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
  active boolean not null default true,
  sort int not null default 0,
  stock int not null default 0 check (stock >= 0)  -- shared by all variants; orders take it, cancelling gives it back
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
  items jsonb not null,             -- [{product_id, name, variant, qty, price}] frozen at order time
  total numeric(12,2) not null,
  -- pending (Recibido) → paid → preparing → ready → delivered; labels in src/admin/Orders.jsx
  status text not null default 'pending' check (status in ('pending', 'paid', 'preparing', 'ready', 'delivered')),
  wholesale boolean not null default false,  -- "Precio mayorista": the admin types what was actually charged
  amount_received numeric(12,2),    -- what was charged: the total, or the typed amount for wholesale
  delivered_at timestamptz,
  ip text                           -- customer's IP (from place-order), only for the per-IP order limit
);

-- Takes the stock and saves the order in one transaction, so two customers can't both get the last unit.
-- Only the place-order function (service role) calls it. Raises 'out_of_stock:<product id>'.
create function create_order(o jsonb) returns bigint language plpgsql set search_path = public as $$
declare
  line record;
  new_id bigint;
begin
  -- Max 5 orders per IP per hour (anti-spam; Turnstile stops bots, this stops a person mashing the button).
  -- The lock makes concurrent orders from one IP count one at a time. Deleted orders don't count.
  if o->>'ip' is not null then
    perform pg_advisory_xact_lock(hashtext(o->>'ip'));
    if (select count(*) from orders where ip = o->>'ip' and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'too_many_orders';
    end if;
  end if;
  -- Ordered by id so concurrent orders lock products in the same order (no deadlocks).
  for line in
    select (x->>'product_id')::bigint as id, sum((x->>'qty')::int) as qty
    from jsonb_array_elements(o->'items') x group by 1 order by 1
  loop
    update products set stock = stock - line.qty where id = line.id and stock >= line.qty;
    if not found then raise exception 'out_of_stock:%', line.id; end if;
  end loop;
  insert into orders (customer_name, phone, notes, delivery_date, items, total, ip)
  values (o->>'customer_name', o->>'phone', o->>'notes', (o->>'delivery_date')::date, o->'items', (o->>'total')::numeric, o->>'ip')
  returning id into new_id;
  return new_id;
end $$;
revoke execute on function create_order(jsonb) from public, anon, authenticated;
grant execute on function create_order(jsonb) to service_role;

-- Deleting an undelivered order = cancelling it: its stock goes back. Delivered orders keep theirs.
create function restock_cancelled_order() returns trigger language plpgsql set search_path = public as $$
begin
  if old.status <> 'delivered' then
    update products p set stock = p.stock + x.qty
    from (
      select (i->>'product_id')::bigint as id, sum((i->>'qty')::int) as qty
      from jsonb_array_elements(old.items) i where i ? 'product_id' group by 1
    ) x
    where p.id = x.id;
  end if;
  return old;
end $$;
create trigger restock after delete on orders for each row execute function restock_cancelled_order();

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
