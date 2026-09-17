-- ============================================================================
-- Pizzeria — schemat bazy (Postgres / Supabase).
--
-- Odpowiednik dzisiejszych plików w .data/ (orders.json, menu.json, feedback.json,
-- login-codes.json, uploads/). Aplikacja łączy się z bazą wyłącznie z serwera
-- (klucz service_role) — dlatego RLS jest włączone wszędzie, a publicznie czytelne
-- są tylko: dostępne menu i opublikowane opinie.
-- ============================================================================

create extension if not exists citext;

-- ---------------------------------------------------------------- menu
create table public.menu_categories (
  id          text primary key,
  label       text not null check (char_length(label) between 2 and 40),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.menu_items (
  id           text primary key,
  category_id  text not null references public.menu_categories(id) on update cascade on delete restrict,
  name         text not null check (char_length(name) between 2 and 60),
  description  text not null default '' check (char_length(description) <= 200),
  price        numeric(8,2) not null check (price >= 0 and price <= 999),
  tag          text check (tag in ('Piccante', 'Vegetariana', 'Novità', 'Più amata')),
  art          text check (art in ('margherita','marinara','diavola','capricciosa','funghi','quattro','bufalina','tartufo','nduja','mortadella')),
  photo_path   text,                                  -- ścieżka w buckecie storage "uploads"
  available    boolean not null default true,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index menu_items_category_position on public.menu_items (category_id, position);

-- ---------------------------------------------------------------- zamówienia
create table public.orders (
  id                   text primary key,                 -- losowy, nie do zgadnięcia (link śledzenia)
  created_at           timestamptz not null default now(),
  mode                 text not null check (mode in ('domicilio', 'ritiro')),
  status               text not null default 'ricevuto'
                         check (status in ('ricevuto','accettato','in_viaggio','pronto','consegnato','ritirato','rifiutato')),
  customer_name        text not null,
  customer_phone       text not null,
  customer_email       citext not null,
  address              text,
  location_lat         double precision,
  location_lng         double precision,
  zone_id              text,
  zone_name            text,
  travel_minutes       integer not null default 0,
  subtotal             numeric(8,2) not null,
  delivery_fee         numeric(8,2) not null default 0,
  total                numeric(8,2) not null,
  payment_method       text not null default 'cash' check (payment_method in ('card', 'cash')),
  notes                text not null default '',
  placed_while_closed  boolean not null default false,
  lang                 text not null default 'it' check (lang in ('it','pl','en','de','fr','es')),
  reject_reason        text,
  rider_lat            double precision,                 -- ostatnia pozycja GPS kierowcy
  rider_lng            double precision,
  rider_at             timestamptz
);
create index orders_created_at on public.orders (created_at desc);
create index orders_customer_email on public.orders (customer_email);
create index orders_open on public.orders (status) where status not in ('consegnato','ritirato','rifiutato');

-- pozycje z ceną z chwili zamówienia (menu może się potem zmienić)
create table public.order_lines (
  order_id  text not null references public.orders(id) on delete cascade,
  item_id   text not null,
  name      text not null,
  qty       integer not null check (qty between 1 and 20),
  price     numeric(8,2) not null,
  primary key (order_id, item_id)
);

-- historia etapów
create table public.order_events (
  id        bigint generated always as identity primary key,
  order_id  text not null references public.orders(id) on delete cascade,
  status    text not null,
  at        timestamptz not null default now()
);
create index order_events_order on public.order_events (order_id, at);

-- log wysłanych e-maili
create table public.order_emails (
  id        bigint generated always as identity primary key,
  order_id  text not null references public.orders(id) on delete cascade,
  at        timestamptz not null default now(),
  status    text not null,
  subject   text not null,
  sent      boolean not null,
  note      text
);

-- ---------------------------------------------------------------- opinie
create table public.feedback (
  id               text primary key,
  created_at       timestamptz not null default now(),
  rating           smallint not null check (rating between 1 and 5),
  name             text not null default 'Anonimo',
  text             text not null default '' check (char_length(text) <= 1000),
  route            text not null check (route in ('google', 'privato')),
  status           text not null default 'nuovo' check (status in ('nuovo', 'gestito')),
  handled_at       timestamptz,
  published        boolean not null default false,
  order_id         text unique references public.orders(id) on delete set null,   -- jedna opinia na zamówienie
  email            citext,
  photos           text[] not null default '{}',                                  -- ścieżki w buckecie "uploads"
  photos_approved  boolean not null default false
);
create index feedback_published on public.feedback (created_at desc) where published;

create table public.reactions (
  kind   text primary key check (kind in ('amore', 'buonissima', 'pazzesca', 'fuoco')),
  count  bigint not null default 0
);
insert into public.reactions (kind) values ('amore'), ('buonissima'), ('pazzesca'), ('fuoco');

-- atomowe +1 bez wyścigów
create or replace function public.bump_reaction(p_kind text)
returns bigint language sql security definer set search_path = public as $$
  update public.reactions set count = count + 1 where kind = p_kind returning count;
$$;

-- ---------------------------------------------------------------- logowanie kodem
create table public.login_codes (
  email_key   text primary key,             -- HMAC adresu, nie sam adres
  hash        text not null,                -- HMAC kodu
  expires_at  timestamptz not null,
  attempts    smallint not null default 0,
  sent_at     timestamptz[] not null default '{}'
);
create index login_codes_expires on public.login_codes (expires_at);

-- ---------------------------------------------------------------- klienci (widok)
create view public.customers as
select
  lower(customer_email::text)                                   as email,
  (array_agg(customer_name order by created_at desc))[1]        as name,
  (array_agg(customer_phone order by created_at desc))[1]       as phone,
  count(*) filter (where status <> 'rifiutato')                 as orders,
  coalesce(sum(total) filter (where status <> 'rifiutato'), 0)  as spent,
  count(*) filter (where status = 'rifiutato')                  as rejected,
  max(created_at)                                               as last_order_at,
  (array_agg(address order by created_at desc) filter (where address is not null))[1] as last_address
from public.orders
group by lower(customer_email::text);

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.menu_categories enable row level security;
alter table public.menu_items      enable row level security;
alter table public.orders          enable row level security;
alter table public.order_lines     enable row level security;
alter table public.order_events    enable row level security;
alter table public.order_emails    enable row level security;
alter table public.feedback        enable row level security;
alter table public.reactions       enable row level security;
alter table public.login_codes     enable row level security;

-- publicznie: menu (tylko dostępne pozycje), opublikowane opinie, liczniki reakcji
create policy "menu categories are public" on public.menu_categories for select to anon, authenticated using (true);
create policy "available menu items are public" on public.menu_items for select to anon, authenticated using (available);
create policy "published feedback is public" on public.feedback for select to anon, authenticated using (published);
create policy "reactions are public" on public.reactions for select to anon, authenticated using (true);
-- wszystko inne (zamówienia, e-maile, kody, zapisy) — tylko serwer z kluczem service_role, który omija RLS.

revoke all on public.customers from anon, authenticated;
revoke execute on function public.bump_reaction(text) from anon, authenticated;

-- ---------------------------------------------------------------- storage
-- zdjęcia produktów i opinii; publiczne do odczytu (nazwy są losowe), zapis tylko z serwera
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
